<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import DataTable, { type DataTableColumn } from "./components/DataTable.vue";
import {
  adminCancelOrder,
  adminConfirmOrder,
  adminCreateOrder,
  adminLogin,
  adminResetPassword,
  adminUpdateOrder,
  cancelProfileOrder,
  createProfileOrder,
  createReservation,
  getAdminDashboard,
  getPublicState,
  loginProfile,
  saveAdminSettings,
  updateProfileOrder,
  type AdminDashboard,
  type AdminSettings,
  type Order,
  type Payment,
  type ProfileOrder,
  type ProfileResponse,
  type PublicState
} from "./api";
import { useSessionStore } from "./stores/session";

type SettingsForm = Omit<AdminSettings, "id" | "updatedAt">;
type AdminOrderEdit = { name: string; jarCount: number; status: Order["status"]; source: Order["source"] };

const routeLabels = {
  "/": "Domů",
  "/chcimed": "Chci med",
  "/mujmed": "Můj med",
  "/admin": "⚙️",
  "/objednavky": "Objednávky"
} as const;

type AppRoute = keyof typeof routeLabels;

function normalizeRoute(path: string): AppRoute {
  const normalized = path.replace(/\/+$/, "") || "/";
  return normalized in routeLabels ? (normalized as AppRoute) : "/";
}

const session = useSessionStore();
const currentRoute = ref<AppRoute>(normalizeRoute(window.location.pathname));
const publicState = ref<PublicState | null>(null);
const profile = ref<ProfileResponse | null>(null);
const admin = ref<AdminDashboard | null>(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const profilePasswordInput = ref<HTMLInputElement | null>(null);
const lastPayment = ref<{ order: Pick<Order, "id" | "jarCount" | "customerName">; payment: Payment } | null>(null);

const reservation = reactive({
  name: "",
  password: "",
  jarCount: 1
});

const profileLogin = reactive({
  name: "",
  password: ""
});

const profileAddCount = ref(1);
const editingOrders = reactive<Record<string, number>>({});
const adminPassword = ref("");
const passwordResets = reactive<Record<string, string>>({});
const adminEditingOrders = reactive<Record<string, AdminOrderEdit>>({});
const adminEditingOrderIds = reactive<Record<string, boolean>>({});

const settingsForm = reactive<SettingsForm>({
  totalJars: 100,
  pricePerJarCzk: 200,
  iban: "",
  swift: "",
  revolutUsername: "",
  revolutLink: "",
  paymentMessage: "Platba za med"
});

const adminOrder = reactive({
  name: "",
  jarCount: 1,
  password: "",
  confirmed: true
});

const availableJars = computed(() => publicState.value?.availableJars ?? 0);
const totalJars = computed(() => publicState.value?.settings.totalJars ?? 0);
const progressPercent = computed(() => {
  if (!publicState.value || publicState.value.settings.totalJars === 0) {
    return 0;
  }

  return Math.min(100, Math.round((publicState.value.totalReservedJars / publicState.value.settings.totalJars) * 100));
});
const canReserve = computed(() => availableJars.value > 0);
const adminOrders = computed(() => admin.value?.orders ?? []);
const navItems = computed(() =>
  (Object.keys(routeLabels) as AppRoute[])
    .filter((path) => path !== "/objednavky" || admin.value)
    .map((path) => ({ path, label: routeLabels[path] }))
);
const adminOrderColumns = computed<DataTableColumn[]>(() => [
  {
    key: "name",
    label: "Jméno",
    sortable: true,
    getSortValue: (row) => asOrder(row).customerName,
    getFilterValue: (row) => asOrder(row).customerName
  },
  {
    key: "jarCount",
    label: "Ks",
    align: "right",
    sortable: true,
    getSortValue: (row) => asOrder(row).jarCount,
    getFilterValue: (row) => asOrder(row).jarCount
  },
  {
    key: "amount",
    label: "K úhradě",
    align: "right",
    sortable: true,
    getSortValue: (row) => orderAmount(asOrder(row)),
    getFilterValue: (row) => money(orderAmount(asOrder(row)))
  },
  {
    key: "status",
    label: "Stav",
    sortable: true,
    getSortValue: (row) => statusLabel(asOrder(row).status),
    getFilterValue: (row) => statusLabel(asOrder(row).status)
  },
  {
    key: "source",
    label: "Zdroj",
    sortable: true,
    getSortValue: (row) => sourceLabel(asOrder(row).source),
    getFilterValue: (row) => sourceLabel(asOrder(row).source)
  },
  {
    key: "createdAt",
    label: "Datum",
    sortable: true,
    getSortValue: (row) => new Date(asOrder(row).createdAt),
    getFilterValue: (row) => formatDate(asOrder(row).createdAt)
  },
  {
    key: "actions",
    label: "Akce",
    align: "right"
  }
]);

function navigateTo(route: AppRoute) {
  if (currentRoute.value !== route) {
    window.history.pushState({}, "", route);
    currentRoute.value = route;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handlePopstate() {
  currentRoute.value = normalizeRoute(window.location.pathname);
}

async function run(action: () => Promise<void>) {
  loading.value = true;
  error.value = "";
  notice.value = "";

  try {
    await action();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Akce se nepovedla.";
  } finally {
    loading.value = false;
  }
}

async function refreshPublic() {
  publicState.value = await getPublicState();
}

function syncProfileEditing() {
  for (const order of profile.value?.orders ?? []) {
    if (order.status === "PENDING") {
      editingOrders[order.id] = order.jarCount;
    }
  }
}

function syncAdminSettings(dashboard: AdminDashboard) {
  settingsForm.totalJars = dashboard.settings.totalJars;
  settingsForm.pricePerJarCzk = dashboard.settings.pricePerJarCzk;
  settingsForm.iban = dashboard.settings.iban;
  settingsForm.swift = dashboard.settings.swift;
  settingsForm.revolutUsername = dashboard.settings.revolutUsername;
  settingsForm.revolutLink = dashboard.settings.revolutLink;
  settingsForm.paymentMessage = dashboard.settings.paymentMessage;

  for (const customer of dashboard.customers) {
    passwordResets[customer.id] ??= "";
  }
}

function syncAdminOrderEditing(dashboard: AdminDashboard) {
  for (const order of dashboard.orders) {
    if (adminEditingOrderIds[order.id]) {
      continue;
    }

    resetAdminOrderEdit(order);
  }
}

function resetAdminOrderEdit(order: Order) {
  adminEditingOrders[order.id] = {
    name: order.customerName,
    jarCount: order.jarCount,
    status: order.status,
    source: order.source
  };
}

async function refreshAdmin() {
  admin.value = await getAdminDashboard(adminPassword.value);
  syncAdminSettings(admin.value);
  syncAdminOrderEditing(admin.value);
}

async function submitReservation() {
  await run(async () => {
    const response = await createReservation({ ...reservation });
    publicState.value = response.publicState;
    lastPayment.value = { order: response.order, payment: response.payment };
    profileLogin.name = reservation.name;
    profileLogin.password = reservation.password;
    session.rememberCustomer(reservation.name);
    profile.value = await loginProfile({ name: reservation.name, password: reservation.password });
    syncProfileEditing();
    reservation.jarCount = 1;
    notice.value = "Rezervace je uložená. QR platba je připravená níže.";
  });
}

async function submitProfileLogin() {
  await run(async () => {
    profile.value = await loginProfile({ ...profileLogin });
    session.rememberCustomer(profile.value.customer.name);
    syncProfileEditing();
    notice.value = "Profil je odemčený.";
  });
}

async function addProfileOrder() {
  await run(async () => {
    const response = await createProfileOrder({ ...profileLogin, jarCount: profileAddCount.value });
    profile.value = response.profile;
    publicState.value = response.publicState;
    lastPayment.value = { order: response.order, payment: response.payment };
    syncProfileEditing();
    profileAddCount.value = 1;
    notice.value = "Další rezervace je přidaná.";
  });
}

async function updateOwnOrder(order: ProfileOrder) {
  await run(async () => {
    const response = await updateProfileOrder(order.id, { ...profileLogin, jarCount: editingOrders[order.id] ?? order.jarCount });
    profile.value = response.profile;
    publicState.value = response.publicState;
    lastPayment.value = { order: response.order, payment: response.payment };
    syncProfileEditing();
    notice.value = "Rezervace je upravená.";
  });
}

async function cancelOwnOrder(order: ProfileOrder) {
  await run(async () => {
    const response = await cancelProfileOrder(order.id, { ...profileLogin });
    profile.value = response.profile;
    publicState.value = response.publicState;
    lastPayment.value = null;
    syncProfileEditing();
    notice.value = "Rezervace je zrušená.";
  });
}

async function submitAdminLogin() {
  await run(async () => {
    await adminLogin(adminPassword.value);
    await refreshAdmin();
    notice.value = "Admin je odemčený.";
  });
}

async function submitSettings() {
  await run(async () => {
    const response = await saveAdminSettings(adminPassword.value, { ...settingsForm });
    publicState.value = response.publicState;
    await refreshAdmin();
    notice.value = "Nastavení je uložené.";
  });
}

async function submitAdminOrder() {
  await run(async () => {
    const response = await adminCreateOrder(adminPassword.value, {
      name: adminOrder.name,
      jarCount: adminOrder.jarCount,
      password: adminOrder.password || undefined,
      confirmed: adminOrder.confirmed
    });
    publicState.value = response.publicState;
    await refreshAdmin();
    adminOrder.name = "";
    adminOrder.jarCount = 1;
    adminOrder.password = "";
    notice.value = "Osobní objednávka je zapsaná.";
  });
}

async function confirmAdminOrder(order: Order) {
  await run(async () => {
    const response = await adminConfirmOrder(adminPassword.value, order.id);
    publicState.value = response.publicState;
    await refreshAdmin();
    notice.value = "Objednávka je potvrzená.";
  });
}

async function cancelAdminOrder(order: Order) {
  await run(async () => {
    const response = await adminCancelOrder(adminPassword.value, order.id);
    publicState.value = response.publicState;
    await refreshAdmin();
    notice.value = "Objednávka je zrušená.";
  });
}

async function updateAdminOrder(order: Order) {
  const form = adminEditingOrders[order.id];

  if (!form) {
    return;
  }

  await run(async () => {
    const response = await adminUpdateOrder(adminPassword.value, order.id, { ...form });
    publicState.value = response.publicState;
    adminEditingOrderIds[order.id] = false;
    await refreshAdmin();
    notice.value = "Objednávka je upravená.";
  });
}

function startAdminOrderEdit(order: Order) {
  resetAdminOrderEdit(order);
  adminEditingOrderIds[order.id] = true;
}

function cancelAdminOrderEdit(order: Order) {
  resetAdminOrderEdit(order);
  adminEditingOrderIds[order.id] = false;
}

async function resetCustomerPassword(customerId: string) {
  await run(async () => {
    await adminResetPassword(adminPassword.value, customerId, passwordResets[customerId]);
    passwordResets[customerId] = "";
    notice.value = "Heslo je změněné.";
  });
}

async function selectCustomer(name: string) {
  profileLogin.name = name;
  reservation.name ||= name;
  navigateTo("/mujmed");
  await nextTick();
  profilePasswordInput.value?.focus();
}

function showPayment(order: ProfileOrder) {
  if (order.payment) {
    lastPayment.value = { order, payment: order.payment };
    document.getElementById("platba")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function maxForOrder(order: ProfileOrder) {
  return Math.max(1, availableJars.value + order.jarCount);
}

function statusLabel(status: Order["status"]) {
  return {
    PENDING: "Čeká na potvrzení",
    CONFIRMED: "Potvrzeno",
    CANCELLED: "Zrušeno"
  }[status];
}

function sourceLabel(source: Order["source"]) {
  return source === "ADMIN" ? "osobně" : "web";
}

function statusClass(status: Order["status"]) {
  return {
    PENDING: "bg-amber-100 text-amber-800",
    CONFIRMED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-stone-200 text-stone-600"
  }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value)
  );
}

function money(value: number) {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(value);
}

function asOrder(row: unknown) {
  return row as Order;
}

function orderAmount(order: Order) {
  return order.jarCount * (admin.value?.settings.pricePerJarCzk ?? publicState.value?.settings.pricePerJarCzk ?? 0);
}

function editableOrderAmount(order: Order) {
  return (adminEditingOrders[order.id]?.jarCount ?? order.jarCount) * (admin.value?.settings.pricePerJarCzk ?? 0);
}

onMounted(async () => {
  window.addEventListener("popstate", handlePopstate);
  profileLogin.name = session.lastCustomerName;
  reservation.name = session.lastCustomerName;
  await run(refreshPublic);
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", handlePopstate);
});
</script>

<template>
  <main class="relative min-h-screen overflow-hidden bg-honey-50 text-stone-900">
    <div class="honeycomb-bg" aria-hidden="true"></div>
    <div class="bee bee-one" aria-hidden="true">🐝</div>
    <div class="bee bee-two" aria-hidden="true">🐝</div>
    <div class="bee bee-three" aria-hidden="true">🐝</div>

    <header class="relative z-10 mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <nav class="rounded-[1.75rem] border-4 border-white/70 bg-white/80 p-3 shadow-honey backdrop-blur md:flex md:items-center md:justify-between">
        <button class="flex w-full items-center justify-center rounded-2xl bg-honey-100 px-4 py-3 text-center font-display text-2xl font-black leading-tight text-stone-950 md:w-auto" type="button" @click="navigateTo('/')">
          Domácí med
        </button>
        <div class="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:flex-wrap md:justify-end">
          <button
            v-for="item in navItems"
            :key="item.path"
            class="rounded-2xl px-4 py-3 text-sm font-black transition hover:-translate-y-0.5 sm:text-base"
            :class="currentRoute === item.path ? 'bg-stone-950 text-white shadow-lg' : 'bg-white text-stone-700 hover:bg-honey-100'"
            type="button"
            :aria-label="item.path === '/admin' ? 'Admin' : item.label"
            :title="item.path === '/admin' ? 'Admin' : item.label"
            @click="navigateTo(item.path)"
          >
            {{ item.label }}
          </button>
        </div>
      </nav>
    </header>

    <section class="relative z-10 mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div v-if="error" class="alert alert-error">{{ error }}</div>
      <div v-if="notice" class="alert alert-success">{{ notice }}</div>
    </section>

    <template v-if="currentRoute === '/'">
      <section class="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div class="rounded-[2rem] border-4 border-white/80 bg-white/75 p-6 shadow-honey backdrop-blur sm:p-9">
          <div class="max-w-4xl space-y-5 text-lg leading-relaxed text-stone-700 sm:text-xl">
            <p class="inline-flex rounded-full bg-honey-200 px-4 py-2 text-sm font-black uppercase tracking-wide text-honey-800 sm:text-base">
              🍯 Domácí BIO řemeslný 100% organic homemade med 🐝
            </p>
            <p>
              Ahoj, švagr včelaří a stejně jako minulý rok jsem přivezl pár sklenic medu.
            </p>
            <p>
              Tentokrát jsem věřil, že se to rozebere, tak jsem rovnou vzal
              <strong class="rounded-2xl bg-honey-200 px-3 py-1 font-black text-honey-800">{{ totalJars }} sklenic</strong>.
            </p>
            <p>
              A protože jsem špatný překupník, tak je cena:
            </p>
            <p class="rounded-[1.75rem] bg-stone-950 p-5 text-white shadow-xl">
              <strong class="block pt-2 font-display text-4xl font-black text-honey-300 sm:text-5xl">
                {{ money(publicState?.settings.pricePerJarCzk ?? 200) }} za kilo
              </strong>
            </p>
          </div>

          <div class="mt-8 grid gap-4 sm:grid-cols-3">
            <div class="stat-card">
              <span>Volné sklenice</span>
              <strong>{{ availableJars }}</strong>
            </div>
            <div class="stat-card">
              <span>Rezervováno</span>
              <strong>{{ publicState?.totalReservedJars ?? 0 }}</strong>
            </div>
            <div class="stat-card">
              <span>Cena za kus</span>
              <strong>{{ money(publicState?.settings.pricePerJarCzk ?? 0) }}</strong>
            </div>
          </div>

          <div class="mt-8 rounded-3xl bg-stone-950 p-4 text-white shadow-xl">
            <div class="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-honey-100">
              <span>Stav zásob</span>
              <span>{{ progressPercent }} % pryč</span>
            </div>
            <div class="h-5 overflow-hidden rounded-full bg-white/20">
              <div class="h-full rounded-full bg-gradient-to-r from-honey-300 via-honey-400 to-orange-500 transition-all" :style="{ width: `${progressPercent}%` }"></div>
            </div>
          </div>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <button class="btn-primary text-lg" type="button" :disabled="!canReserve" @click="navigateTo('/chcimed')">
              {{ canReserve ? "Chci med" : "Med je vyprodaný" }}
            </button>
            <button class="btn-secondary text-lg" type="button" @click="navigateTo('/mujmed')">Můj med</button>
          </div>
        </div>
      </section>

      <section class="relative z-10 mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div class="panel">
          <h2 class="section-title">Přehled medojedů</h2>
          <div class="mt-5 overflow-hidden rounded-3xl border border-honey-200 bg-white">
            <table class="w-full text-left text-sm">
              <thead class="bg-honey-100 text-honey-700">
                <tr>
                  <th class="px-4 py-3">Jméno</th>
                  <th class="px-4 py-3 text-right">Sklenice</th>
                  <th class="hidden px-4 py-3 text-right sm:table-cell">Potvrzeno</th>
                  <th class="hidden px-4 py-3 text-right sm:table-cell">Čeká</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!publicState?.customers.length">
                  <td class="px-4 py-5 text-stone-500" colspan="4">Zatím žádná rezervace. Buď první.</td>
                </tr>
                <tr v-for="customer in publicState?.customers" :key="customer.name" class="border-t border-honey-100">
                  <td class="px-4 py-3">
                    <button class="font-bold text-stone-900 underline decoration-honey-300 decoration-4 underline-offset-4" type="button" @click="selectCustomer(customer.name)">
                      {{ customer.name }}
                    </button>
                  </td>
                  <td class="px-4 py-3 text-right font-black">{{ customer.activeJarCount }}</td>
                  <td class="hidden px-4 py-3 text-right text-emerald-700 sm:table-cell">{{ customer.confirmedJarCount }}</td>
                  <td class="hidden px-4 py-3 text-right text-amber-700 sm:table-cell">{{ customer.pendingJarCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <section v-if="currentRoute === '/chcimed'" class="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-10">
      <div class="panel self-start">
        <p class="section-kicker">Rychlá rezervace</p>
        <h1 class="section-title">Kolik sklenic medu chceš?</h1>
        <p class="mt-3 text-stone-600">Po rezervaci uvidíš QR platbu a profil se rovnou odemkne pro případnou pozdější úpravu.</p>
        <div class="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <div class="stat-card">
            <span>Volné sklenice</span>
            <strong>{{ availableJars }}</strong>
          </div>
          <div class="stat-card">
            <span>Cena za kus</span>
            <strong>{{ money(publicState?.settings.pricePerJarCzk ?? 0) }}</strong>
          </div>
          <div class="stat-card">
            <span>Rezervováno</span>
            <strong>{{ publicState?.totalReservedJars ?? 0 }}</strong>
          </div>
        </div>
      </div>

      <form class="panel self-start" @submit.prevent="submitReservation">
        <p class="section-kicker">Chci med</p>
        <h2 class="section-title">Rezervace</h2>

        <label class="field-label" for="reserve-count">Počet sklenic</label>
        <input id="reserve-count" v-model.number="reservation.jarCount" class="input" type="number" min="1" :max="Math.max(availableJars, 1)" required />

        <label class="field-label" for="reserve-name">Jméno v tabulce</label>
        <input id="reserve-name" v-model="reservation.name" class="input" autocomplete="name" maxlength="80" required />

        <label class="field-label" for="reserve-password">Heslo pro pozdější úpravu</label>
        <input id="reserve-password" v-model="reservation.password" class="input" type="password" autocomplete="new-password" minlength="4" required />

        <div class="mt-5 rounded-2xl bg-honey-100 p-4 text-sm text-honey-700">
          K zaplacení: <strong>{{ money((publicState?.settings.pricePerJarCzk ?? 0) * reservation.jarCount) }}</strong>
        </div>

        <button class="btn-primary mt-5 w-full" type="submit" :disabled="loading || !canReserve">Rezervovat a zobrazit QR</button>
      </form>
    </section>

    <section id="platba" v-if="lastPayment" class="relative z-10 mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <div class="panel">
        <p class="section-kicker">Platba</p>
        <h2 class="section-title">{{ lastPayment.order.jarCount }} sklenic pro {{ lastPayment.order.customerName }}</h2>
        <p class="mt-2 text-stone-600">Částka: <strong>{{ money(lastPayment.payment.amountCzk) }}</strong>. Zpráva: {{ lastPayment.payment.message }}</p>

        <div class="mt-6 grid gap-4 md:grid-cols-2">
          <div v-if="lastPayment.payment.bankQr" class="qr-card">
            <h3>Bankovní QR</h3>
            <img :src="lastPayment.payment.bankQr" alt="Bankovní QR platba" />
            <p class="text-sm font-black text-stone-700">Částka k úhradě: {{ money(lastPayment.payment.amountCzk) }}</p>
          </div>
          <div v-if="lastPayment.payment.revolutQr" class="qr-card">
            <h3>Revolut QR</h3>
            <img :src="lastPayment.payment.revolutQr" alt="Revolut QR platba" />
            <a class="text-sm font-bold text-honey-700 underline" :href="lastPayment.payment.revolutLink ?? undefined" target="_blank" rel="noreferrer">
              Otevřít Revolut odkaz
            </a>
          </div>
          <div v-if="!lastPayment.payment.bankQr && !lastPayment.payment.revolutQr" class="rounded-2xl bg-stone-100 p-5 text-stone-600">
            Admin ještě nenastavil IBAN ani Revolut odkaz, QR platba zatím není k dispozici.
          </div>
        </div>
      </div>
    </section>

    <section v-if="currentRoute === '/mujmed'" class="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div id="profil" class="panel">
        <p class="section-kicker">Můj med</p>
        <h1 class="section-title">Moje objednávky</h1>
        <p class="mt-3 text-stone-600">Přihlas se jménem z tabulky a heslem, které sis nastavil při první rezervaci.</p>
        <form class="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="submitProfileLogin">
          <input v-model="profileLogin.name" class="input" placeholder="Jméno" autocomplete="name" required />
          <input ref="profilePasswordInput" v-model="profileLogin.password" class="input" type="password" placeholder="Heslo" autocomplete="current-password" required />
          <button class="btn-secondary" type="submit" :disabled="loading">Odemknout</button>
        </form>
        <p v-if="session.lastCustomerName" class="mt-2 text-sm text-stone-500">Poslední použitý profil: {{ session.lastCustomerName }}</p>

        <div v-if="profile" class="mt-6 space-y-4">
          <div class="rounded-3xl bg-honey-100 p-4">
            <h3 class="text-xl font-black">{{ profile.customer.name }}</h3>
            <p class="text-sm text-honey-700">Potvrzené objednávky zůstávají zamčené, novou můžeš přidat kdykoliv.</p>
          </div>

          <article v-for="order in profile.orders" :key="order.id" class="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="font-black">{{ order.jarCount }} sklenic</p>
                <p class="text-sm text-stone-500">{{ formatDate(order.createdAt) }} · {{ sourceLabel(order.source) }}</p>
              </div>
              <span class="rounded-full px-3 py-1 text-xs font-black" :class="statusClass(order.status)">{{ statusLabel(order.status) }}</span>
            </div>

            <div v-if="order.status === 'PENDING'" class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input v-model.number="editingOrders[order.id]" class="input" type="number" min="1" :max="maxForOrder(order)" />
              <button class="btn-save" type="button" @click="updateOwnOrder(order)">Uložit</button>
              <button class="btn-danger" type="button" @click="cancelOwnOrder(order)">Zrušit</button>
            </div>

            <button v-if="order.payment && order.status !== 'CANCELLED'" class="mt-4 text-sm font-black text-honey-700 underline" type="button" @click="showPayment(order)">
              Zobrazit QR platbu {{ money(order.payment.amountCzk) }}
            </button>
          </article>

          <form class="rounded-3xl bg-stone-950 p-4 text-white" @submit.prevent="addProfileOrder">
            <h3 class="text-xl font-black">Přidat další objednávku</h3>
            <div class="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input v-model.number="profileAddCount" class="input text-stone-900" type="number" min="1" :max="Math.max(availableJars, 1)" />
              <button class="btn-primary" type="submit" :disabled="!canReserve">Přidat</button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <section v-if="currentRoute === '/admin'" class="relative z-10 mx-auto max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
      <div class="panel border-stone-950 bg-stone-950 text-white">
        <p class="section-kicker text-honey-300">Admin</p>
        <h1 class="section-title text-white">Správa medu</h1>
        <form v-if="!admin" class="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" @submit.prevent="submitAdminLogin">
          <input v-model="adminPassword" class="input text-stone-900" type="password" placeholder="Heslo" required />
          <button class="btn-primary" type="submit">Odemknout</button>
        </form>

        <div v-else class="mt-6 grid gap-6">
          <div class="space-y-6">
            <form class="admin-card" @submit.prevent="submitSettings">
              <h3 class="admin-title">Nastavení prodeje</h3>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="admin-field">Celkem sklenic<input v-model.number="settingsForm.totalJars" class="input text-stone-900" type="number" min="0" /></label>
                <label class="admin-field">Cena za kus CZK<input v-model.number="settingsForm.pricePerJarCzk" class="input text-stone-900" type="number" min="0" /></label>
                <label class="admin-field sm:col-span-2">IBAN<input v-model="settingsForm.iban" class="input text-stone-900" /></label>
                <label class="admin-field">SWIFT / BIC<input v-model="settingsForm.swift" class="input text-stone-900" /></label>
                <label class="admin-field">Revolut username<input v-model="settingsForm.revolutUsername" class="input text-stone-900" /></label>
                <label class="admin-field sm:col-span-2">Revolut.me odkaz<input v-model="settingsForm.revolutLink" class="input text-stone-900" placeholder="https://revolut.me/..." /></label>
                <label class="admin-field sm:col-span-2">Zpráva k platbě<input v-model="settingsForm.paymentMessage" class="input text-stone-900" /></label>
              </div>
              <button class="btn-save mt-4" type="submit">Uložit nastavení</button>
            </form>

            <form class="admin-card" @submit.prevent="submitAdminOrder">
              <h3 class="admin-title">Osobní / offline objednávka</h3>
              <div class="grid gap-3 sm:grid-cols-2">
                <input v-model="adminOrder.name" class="input text-stone-900" placeholder="Jméno" required />
                <input v-model.number="adminOrder.jarCount" class="input text-stone-900" type="number" min="1" required />
                <input v-model="adminOrder.password" class="input text-stone-900 sm:col-span-2" placeholder="Volitelné heslo pro nový profil" />
                <label class="flex items-center gap-2 text-sm font-bold text-stone-200 sm:col-span-2">
                  <input v-model="adminOrder.confirmed" type="checkbox" /> Rovnou potvrdit
                </label>
              </div>
              <button class="btn-save mt-4" type="submit">Zapsat objednávku</button>
            </form>

            <div class="admin-card">
              <h3 class="admin-title">Reset hesel</h3>
              <div class="space-y-3">
                <form v-for="customer in admin.customers" :key="customer.id" class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="resetCustomerPassword(customer.id)">
                  <span class="rounded-2xl bg-white/10 px-3 py-3 font-bold">{{ customer.name }}</span>
                  <input v-model="passwordResets[customer.id]" class="input text-stone-900" type="password" placeholder="Nové heslo" minlength="4" required />
                  <button class="btn-save" type="submit">Reset</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="currentRoute === '/objednavky' && admin" class="relative z-10 mx-auto max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
      <div class="panel border-stone-950 bg-stone-950 text-white">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="section-kicker text-honey-300">Admin</p>
            <h1 class="section-title text-white">Objednávky</h1>
          </div>
          <span class="rounded-full bg-white/10 px-4 py-2 text-sm font-black">Volné: {{ admin.totals.availableJars }}</span>
        </div>
        <DataTable
          class="mt-6"
          :rows="adminOrders"
          :columns="adminOrderColumns"
          :row-key="(row) => asOrder(row).id"
          empty-text="Žádné objednávky."
          filter-placeholder="Filtrovat podle jména, stavu, zdroje, data nebo částky..."
        >
          <template #cell-name="{ row }">
            <input v-if="adminEditingOrderIds[asOrder(row).id]" v-model="adminEditingOrders[asOrder(row).id].name" class="input w-48 text-stone-900" maxlength="80" />
            <span v-else class="font-bold">{{ asOrder(row).customerName }}</span>
          </template>

          <template #cell-jarCount="{ row }">
            <input v-if="adminEditingOrderIds[asOrder(row).id]" v-model.number="adminEditingOrders[asOrder(row).id].jarCount" class="input ml-auto w-24 text-right text-stone-900" type="number" min="1" />
            <span v-else class="font-black">{{ asOrder(row).jarCount }}</span>
          </template>

          <template #cell-amount="{ row }">
            <span class="font-black text-honey-100">
              {{ money(adminEditingOrderIds[asOrder(row).id] ? editableOrderAmount(asOrder(row)) : orderAmount(asOrder(row))) }}
            </span>
          </template>

          <template #cell-status="{ row }">
            <select v-if="adminEditingOrderIds[asOrder(row).id]" v-model="adminEditingOrders[asOrder(row).id].status" class="input w-44 text-stone-900">
              <option value="PENDING">Čeká</option>
              <option value="CONFIRMED">Potvrzeno</option>
              <option value="CANCELLED">Zrušeno</option>
            </select>
            <span v-else class="inline-flex rounded-full px-3 py-1 text-xs font-black" :class="statusClass(asOrder(row).status)">{{ statusLabel(asOrder(row).status) }}</span>
          </template>

          <template #cell-source="{ row }">
            <select v-if="adminEditingOrderIds[asOrder(row).id]" v-model="adminEditingOrders[asOrder(row).id].source" class="input w-32 text-stone-900">
              <option value="USER">web</option>
              <option value="ADMIN">osobně</option>
            </select>
            <span v-else>{{ sourceLabel(asOrder(row).source) }}</span>
          </template>

          <template #cell-createdAt="{ row }">
            {{ formatDate(asOrder(row).createdAt) }}
          </template>

          <template #cell-actions="{ row }">
            <div v-if="adminEditingOrderIds[asOrder(row).id]" class="flex flex-wrap justify-end gap-2">
              <button class="btn-save px-4 py-2 text-sm" type="button" @click="updateAdminOrder(asOrder(row))">Uložit</button>
              <button class="btn-secondary px-4 py-2 text-sm" type="button" @click="cancelAdminOrderEdit(asOrder(row))">Zahodit</button>
            </div>
            <div v-else class="flex flex-wrap justify-end gap-3">
              <button class="text-sm font-black text-honey-200 underline" type="button" @click="startAdminOrderEdit(asOrder(row))">Upravit</button>
              <button v-if="asOrder(row).status === 'PENDING'" class="text-sm font-black text-emerald-300 underline" type="button" @click="confirmAdminOrder(asOrder(row))">Potvrdit</button>
              <button v-if="asOrder(row).status !== 'CANCELLED'" class="text-sm font-black text-red-300 underline" type="button" @click="cancelAdminOrder(asOrder(row))">Zrušit</button>
            </div>
          </template>
        </DataTable>
      </div>
    </section>

    <section v-else-if="currentRoute === '/objednavky'" class="relative z-10 mx-auto max-w-3xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
      <div class="panel text-center">
        <p class="section-kicker">Zamčeno</p>
        <h1 class="section-title">Objednávky jsou jen pro admina</h1>
        <p class="mt-3 text-stone-600">Nejdřív se přihlas v administraci.</p>
        <button class="btn-secondary mt-5" type="button" @click="navigateTo('/admin')">Přejít do administrace</button>
      </div>
    </section>
  </main>
</template>
