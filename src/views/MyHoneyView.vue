<template>
  <section class="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <div id="profil" class="panel">
      <p class="section-kicker">Můj med</p>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="section-title">Moje objednávky</h1>
        </div>
        <button v-if="session.isLoggedIn" class="btn-secondary" type="button" @click="logout">Odhlásit</button>
      </div>

      <form v-if="!session.isLoggedIn" class="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="submitLogin">
        <input v-model="loginForm.name" class="input" placeholder="Jméno" autocomplete="name" required />
        <input ref="profilePasswordInput" v-model="loginForm.password" class="input" type="password" placeholder="Heslo" autocomplete="current-password" required />
        <button class="btn-secondary" type="submit" :disabled="loading">Odemknout</button>
      </form>
      <p v-if="!session.isLoggedIn && session.lastCustomerName" class="mt-2 text-sm text-stone-500">Poslední použitý profil: {{ session.lastCustomerName }}</p>

      <PaymentPanel v-if="checkout.lastPayment" class="mt-6" :payment="checkout.lastPayment" @another="startAnotherReservation" @clear="checkout.clearPayment" />

      <div v-if="session.profile" class="mt-6 space-y-4">
        <div class="rounded-3xl bg-honey-100 p-4">
          <h3 class="text-xl font-black">{{ session.profile.customer.name }}</h3>
          <p class="text-sm text-honey-700">Potvrzené objednávky zůstávají zamčené, novou můžeš přidat kdykoliv.</p>
        </div>

        <article v-for="order in session.profile.orders" :key="order.id" class="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="font-black">{{ formatJarCount(order.jarCount) }}</p>
              <p class="text-sm text-stone-500">{{ formatDate(order.createdAt) }} · {{ sourceLabel(order.source) }}</p>
            </div>
            <span class="rounded-full px-3 py-1 text-xs font-black" :class="statusClass(order.status)">{{ statusLabel(order.status) }}</span>
          </div>

          <div v-if="order.status === 'PENDING' && editingOrderIds[order.id]" class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input v-model.number="editingOrders[order.id]" class="input" type="number" min="1" :max="maxForOrder(order)" />
            <button class="btn-save" type="button" :disabled="loading" @click="updateOwnOrder(order)">Uložit</button>
            <button class="btn-secondary" type="button" :disabled="loading" @click="cancelOwnOrderEdit(order)">Zahodit</button>
          </div>

          <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <button v-if="order.payment && order.status !== 'CANCELLED'" class="text-sm font-black text-honey-700 underline" type="button" @click="showPayment(order)">
                Zobrazit QR platbu {{ money(order.payment.amountCzk) }}
              </button>
            </div>
            <div class="ml-auto flex flex-wrap justify-end gap-3">
              <button v-if="order.status === 'PENDING' && !editingOrderIds[order.id]" class="text-sm font-black text-honey-700 underline" type="button" @click="startOwnOrderEdit(order)">Upravit</button>
              <button v-if="order.status === 'PENDING' && !editingOrderIds[order.id]" class="text-sm font-black text-red-600 underline" type="button" :disabled="loading" @click="cancelOwnOrder(order)">Zrušit</button>
            </div>
          </div>
        </article>

        <AnotherOrderButton @another="startAnotherReservation" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { cancelProfileOrder, updateProfileOrder, type Order, type ProfileOrder } from "../api";
import AnotherOrderButton from "../components/AnotherOrderButton.vue";
import PaymentPanel from "../components/PaymentPanel.vue";
import { confirmAction, confirmDanger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useCheckoutStore } from "../stores/checkout";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";
import { formatJarCount, money } from "../utils/format";

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();
const session = useSessionStore();
const market = useMarketStore();
const checkout = useCheckoutStore();
const loading = ref(false);
const profilePasswordInput = ref<HTMLInputElement | null>(null);
const loginForm = reactive({ name: session.lastCustomerName, password: "" });
const editingOrders = reactive<Record<string, number>>({});
const editingOrderIds = reactive<Record<string, boolean>>({});

function syncProfileEditing() {
  for (const order of session.profile?.orders ?? []) {
    if (order.status === "PENDING") {
      editingOrders[order.id] = order.jarCount;
    }
  }
}

async function submitLogin() {
  loading.value = true;

  try {
    await session.login({ ...loginForm });

    if (session.isAdmin) {
      await admin.refresh(session.sessionToken);
    } else {
      admin.logout();
    }

    syncProfileEditing();
    push.success("Profil je odemčený.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Přihlášení se nepovedlo.");
  } finally {
    loading.value = false;
  }
}

async function logout() {
  await session.logout();
  admin.logout();
  checkout.clearPayment();
  loginForm.name = session.lastCustomerName;
  loginForm.password = "";
  push.success("Profil je odhlášený.");
}

async function updateOwnOrder(order: ProfileOrder) {
  const jarCount = editingOrders[order.id] ?? order.jarCount;
  const confirmed = await confirmAction({
    title: "Uložit úpravu rezervace?",
    text: `Rezervace se změní z ${formatJarCount(order.jarCount)} na ${formatJarCount(jarCount)}.`,
    confirmText: "Ano, uložit",
    icon: "question"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    const response = await updateProfileOrder(session.sessionToken, order.id, { jarCount });
    session.setProfile(response.profile);
    market.setPublicState(response.publicState);
    checkout.setSelected({ ...response.order, payment: response.payment });
    editingOrderIds[order.id] = false;
    syncProfileEditing();
    push.success("Rezervace je upravená.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Rezervaci se nepodařilo upravit.");
  } finally {
    loading.value = false;
  }
}

async function cancelOwnOrder(order: ProfileOrder) {
  const confirmed = await confirmDanger({
    title: "Zrušit rezervaci?",
    text: `Rezervace na ${formatJarCount(order.jarCount)} se označí jako zrušená a admin dostane e-mail.`,
    confirmText: "Ano, zrušit"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    const response = await cancelProfileOrder(session.sessionToken, order.id);
    session.setProfile(response.profile);
    market.setPublicState(response.publicState);
    checkout.clearPayment();
    syncProfileEditing();
    push.success("Rezervace je zrušená.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Rezervaci se nepodařilo zrušit.");
  } finally {
    loading.value = false;
  }
}

function showPayment(order: ProfileOrder) {
  checkout.setSelected(order);
  nextTick(() => document.getElementById("platba")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function startOwnOrderEdit(order: ProfileOrder) {
  editingOrders[order.id] = order.jarCount;
  editingOrderIds[order.id] = true;
}

function cancelOwnOrderEdit(order: ProfileOrder) {
  editingOrders[order.id] = order.jarCount;
  editingOrderIds[order.id] = false;
}

function startAnotherReservation() {
  checkout.resetForAnotherReservation();
  router.push("/chcimed");
}

function maxForOrder(order: ProfileOrder) {
  return Math.max(1, market.availableJars + order.jarCount);
}

function statusLabel(status: Order["status"]) {
  return { PENDING: "Čeká na potvrzení", CONFIRMED: "Potvrzeno", CANCELLED: "Zrušeno" }[status];
}

function sourceLabel(source: Order["source"]) {
  return source === "ADMIN" ? "osobně" : "web";
}

function statusClass(status: Order["status"]) {
  return { PENDING: "bg-amber-100 text-amber-800", CONFIRMED: "bg-emerald-100 text-emerald-800", CANCELLED: "bg-stone-200 text-stone-600" }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function applyRouteName() {
  const name = route.query.name;

  if (typeof name === "string" && !session.isLoggedIn) {
    loginForm.name = name;
    nextTick(() => profilePasswordInput.value?.focus());
  }
}

watch(() => session.profile, syncProfileEditing, { immediate: true });
watch(() => route.query.name, applyRouteName);

onMounted(applyRouteName);
</script>
