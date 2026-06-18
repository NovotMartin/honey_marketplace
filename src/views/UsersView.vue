<template>
  <section v-if="session.isAdmin && admin.dashboard" class="relative z-10 mx-auto max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="section-kicker">Admin</p>
          <h1 class="section-title">Uživatelé</h1>
        </div>
        <span class="rounded-full bg-honey-100 px-4 py-2 text-sm font-black text-honey-800">{{ customers.length }} účtů</span>
      </div>

      <div class="mt-6 flex flex-wrap gap-2">
        <button class="rounded-2xl px-4 py-2 font-black transition" :class="activeTab === 'users' ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 hover:bg-honey-100'" type="button" @click="activeTab = 'users'">
          Uživatelé
        </button>
        <button class="rounded-2xl px-4 py-2 font-black transition" :class="activeTab === 'reset-links' ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 hover:bg-honey-100'" type="button" @click="activeTab = 'reset-links'">
          Reset odkazy
        </button>
      </div>

      <DataTable v-if="activeTab === 'users'" class="mt-6" :rows="customers" :columns="columns" row-key="id" empty-text="Žádní uživatelé." filter-placeholder="Filtrovat podle jména nebo data...">
        <template #mobile-row="{ row }">
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xl font-black text-stone-950">{{ asCustomer(row).name }}</p>
                <p class="text-xs font-bold uppercase tracking-wide text-stone-500">{{ formatDate(asCustomer(row).createdAt) }}</p>
              </div>
            </div>
            <UserPasswordActions
              :customer="asCustomer(row)"
              :password="passwordResets[asCustomer(row).id] ?? ''"
              :reset-url="resetLinks[asCustomer(row).id] ?? ''"
              :loading="loading"
              @update:password="passwordResets[asCustomer(row).id] = $event"
              @reset="resetCustomerPassword"
              @link="createResetLink"
              @copy="copyResetLink"
            />
          </div>
        </template>

        <template #cell-name="{ row }">
          <span class="font-black">{{ asCustomer(row).name }}</span>
        </template>

        <template #cell-createdAt="{ row }">{{ formatDate(asCustomer(row).createdAt) }}</template>

        <template #cell-actions="{ row }">
          <UserPasswordActions
            class="min-w-[520px]"
            :customer="asCustomer(row)"
            :password="passwordResets[asCustomer(row).id] ?? ''"
            :reset-url="resetLinks[asCustomer(row).id] ?? ''"
            :loading="loading"
            @update:password="passwordResets[asCustomer(row).id] = $event"
            @reset="resetCustomerPassword"
            @link="createResetLink"
            @copy="copyResetLink"
          />
        </template>
      </DataTable>

      <DataTable v-else class="mt-6" :rows="activeResetLinks" :columns="resetLinkColumns" row-key="id" empty-text="Žádné platné reset odkazy." filter-placeholder="Filtrovat podle uživatele nebo data...">
        <template #mobile-row="{ row }">
          <div class="space-y-3">
            <div>
              <p class="text-xl font-black text-stone-950">{{ asResetLink(row).customerName }}</p>
              <p class="text-sm font-bold text-stone-600">Vytvořeno {{ formatDateTime(asResetLink(row).createdAt) }}</p>
              <p class="text-sm font-bold text-honey-700">Platí do {{ formatDateTime(asResetLink(row).expiresAt) }}</p>
            </div>
            <button class="btn-secondary w-full" type="button" :disabled="loading" @click="invalidateResetLink(asResetLink(row))">Zneplatnit</button>
          </div>
        </template>

        <template #cell-customerName="{ row }">
          <span class="font-black">{{ asResetLink(row).customerName }}</span>
        </template>
        <template #cell-createdAt="{ row }">{{ formatDateTime(asResetLink(row).createdAt) }}</template>
        <template #cell-expiresAt="{ row }">{{ formatDateTime(asResetLink(row).expiresAt) }}</template>
        <template #cell-actions="{ row }">
          <button class="btn-secondary px-4 py-2 text-sm" type="button" :disabled="loading" @click="invalidateResetLink(asResetLink(row))">Zneplatnit</button>
        </template>
      </DataTable>
    </div>
  </section>

  <section v-else class="relative z-10 mx-auto max-w-3xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel text-center">
      <p class="section-kicker">Zamčeno</p>
      <h1 class="section-title">Uživatelé jsou jen pro admina</h1>
      <p class="mt-3 text-stone-600">Nejdřív se přihlas jako admin přes Můj med.</p>
      <RouterLink class="btn-secondary mt-5 inline-flex" to="/mujmed">Přejít na Můj med</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { computed, onMounted, reactive, ref } from "vue";
import { adminCreatePasswordResetLink, adminInvalidatePasswordResetLink, adminResetPassword, getAdminPasswordResetLinks, type PasswordResetLink } from "../api";
import DataTable, { type DataTableColumn } from "../components/DataTable.vue";
import UserPasswordActions, { type UserPasswordCustomer } from "../components/UserPasswordActions.vue";
import { useAutoRefresh } from "../composables/useAutoRefresh";
import { confirmAction, confirmDanger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useSessionStore } from "../stores/session";

type Customer = UserPasswordCustomer;

const admin = useAdminStore();
const session = useSessionStore();
const loading = ref(false);
const activeTab = ref<"users" | "reset-links">("users");
const passwordResets = reactive<Record<string, string>>({});
const resetLinks = reactive<Record<string, string>>({});
const activeResetLinks = ref<PasswordResetLink[]>([]);
const customers = computed(() => admin.dashboard?.customers.filter((customer) => customer.id !== session.profile?.customer.id) ?? []);
const columns: DataTableColumn[] = [
  { key: "name", label: "Jméno", sortable: true, getSortValue: (row) => asCustomer(row).name, getFilterValue: (row) => asCustomer(row).name },
  { key: "createdAt", label: "Vytvořeno", sortable: true, getSortValue: (row) => new Date(asCustomer(row).createdAt), getFilterValue: (row) => formatDate(asCustomer(row).createdAt) },
  { key: "actions", label: "Akce" }
];
const resetLinkColumns: DataTableColumn[] = [
  { key: "customerName", label: "Uživatel", sortable: true, getSortValue: (row) => asResetLink(row).customerName, getFilterValue: (row) => asResetLink(row).customerName },
  { key: "createdAt", label: "Vytvořeno", sortable: true, getSortValue: (row) => new Date(asResetLink(row).createdAt), getFilterValue: (row) => formatDateTime(asResetLink(row).createdAt) },
  { key: "expiresAt", label: "Platí do", sortable: true, getSortValue: (row) => new Date(asResetLink(row).expiresAt), getFilterValue: (row) => formatDateTime(asResetLink(row).expiresAt) },
  { key: "actions", label: "Akce", align: "right" }
];

async function resetCustomerPassword(customer: Customer) {
  const password = passwordResets[customer.id] ?? "";
  const confirmed = await confirmDanger({
    title: "Nastavit nové heslo?",
    text: `Uživatel ${customer.name} bude odhlášený ze všech zařízení a staré reset odkazy přestanou fungovat.`,
    confirmText: "Ano, nastavit"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    await adminResetPassword(session.sessionToken, customer.id, password);
    passwordResets[customer.id] = "";
    resetLinks[customer.id] = "";
    await loadResetLinks();
    push.success("Heslo je nastavené.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Heslo se nepodařilo nastavit.");
  } finally {
    loading.value = false;
  }
}

async function createResetLink(customer: Customer) {
  const confirmed = await confirmAction({
    title: "Vytvořit reset odkaz?",
    text: `Odkaz pro ${customer.name} bude platit 24 hodin a po nastavení hesla přestane fungovat.`,
    confirmText: "Ano, vytvořit",
    icon: "question"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    const response = await adminCreatePasswordResetLink(session.sessionToken, customer.id);
    resetLinks[customer.id] = response.resetUrl;
    await loadResetLinks();
    push.success("Reset odkaz je vytvořený.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Reset odkaz se nepodařilo vytvořit.");
  } finally {
    loading.value = false;
  }
}

async function invalidateResetLink(link: PasswordResetLink) {
  const confirmed = await confirmDanger({
    title: "Zneplatnit reset odkaz?",
    text: `Odkaz pro ${link.customerName} okamžitě přestane fungovat.`,
    confirmText: "Ano, zneplatnit"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    await adminInvalidatePasswordResetLink(session.sessionToken, link.id);
    await loadResetLinks();
    push.success("Reset odkaz je zneplatněný.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Reset odkaz se nepodařilo zneplatnit.");
  } finally {
    loading.value = false;
  }
}

async function loadResetLinks() {
  if (!session.isAdmin) {
    activeResetLinks.value = [];
    return;
  }

  activeResetLinks.value = (await getAdminPasswordResetLinks(session.sessionToken)).links;
}

async function copyResetLink(customer: Customer) {
  try {
    await navigator.clipboard.writeText(resetLinks[customer.id] ?? "");
    push.success("Odkaz je zkopírovaný.");
  } catch {
    push.error("Odkaz se nepodařilo zkopírovat.");
  }
}

function asCustomer(row: unknown) {
  return row as Customer;
}

function asResetLink(row: unknown) {
  return row as PasswordResetLink;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

onMounted(async () => {
  if (session.isAdmin) {
    await admin.refresh(session.sessionToken).catch((error) => push.error(error instanceof Error ? error.message : "Uživatele se nepodařilo načíst."));
    await loadResetLinks().catch((error) => push.error(error instanceof Error ? error.message : "Reset odkazy se nepodařilo načíst."));
  }
});
useAutoRefresh(async () => {
  if (!session.isAdmin) {
    return;
  }

  await admin.refresh(session.sessionToken);
  await loadResetLinks();
}, 30_000);
</script>
