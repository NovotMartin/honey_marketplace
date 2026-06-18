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
        <button class="rounded-2xl px-4 py-2 font-black transition" :class="activeTab === 'users' ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 hover:bg-honey-100'" type="button" @click="setActiveTab('users')">
          Uživatelé
        </button>
        <button class="rounded-2xl px-4 py-2 font-black transition" :class="activeTab === 'reset-links' ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 hover:bg-honey-100'" type="button" @click="setActiveTab('reset-links')">
          <span class="inline-flex items-center gap-2">
            Reset odkazy
            <span v-if="activeResetLinkCount" class="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-black leading-none text-white shadow-sm">{{ activeResetLinkCount }}</span>
          </span>
        </button>
        <button class="rounded-2xl px-4 py-2 font-black transition" :class="activeTab === 'requests' ? 'bg-stone-950 text-white' : 'bg-white text-stone-700 hover:bg-honey-100'" type="button" @click="setActiveTab('requests')">
          <span class="inline-flex items-center gap-2">
            Žádosti o reset
            <span v-if="pendingResetRequestCount" class="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-black leading-none text-white shadow-sm">{{ pendingResetRequestCount }}</span>
          </span>
        </button>
      </div>

      <DataTable
        v-if="activeTab === 'users'"
        class="mt-6"
        :rows="customers"
        :columns="columns"
        row-key="id"
        empty-text="Žádní uživatelé."
        filter-placeholder="Filtrovat podle jména nebo data..."
        show-refresh
        :refreshing="dataLoading"
        @refresh="refreshUsersData(true)"
      >
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
              :loading="loading"
              :show-reset-url="false"
              @update:password="passwordResets[asCustomer(row).id] = $event"
              @reset="resetCustomerPassword"
              @link="createResetLink"
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
            :loading="loading"
            :show-reset-url="false"
            @update:password="passwordResets[asCustomer(row).id] = $event"
            @reset="resetCustomerPassword"
            @link="createResetLink"
          />
        </template>
      </DataTable>

      <DataTable
        v-else-if="activeTab === 'reset-links'"
        class="mt-6"
        :rows="activeResetLinks"
        :columns="resetLinkColumns"
        row-key="id"
        empty-text="Žádné platné reset odkazy."
        filter-placeholder="Filtrovat podle uživatele nebo data..."
        show-refresh
        :refreshing="dataLoading"
        @refresh="refreshUsersData(true)"
      >
        <template #mobile-row="{ row }">
          <div class="space-y-3">
            <div>
              <p class="text-xl font-black text-stone-950">{{ asResetLink(row).customerName }}</p>
              <p class="text-sm font-bold text-stone-600">Vytvořeno {{ formatDateTime(asResetLink(row).createdAt) }}</p>
              <p class="text-sm font-bold text-honey-700">Platí do {{ formatDateTime(asResetLink(row).expiresAt) }}</p>
              <p v-if="asResetLink(row).requestId" class="text-xs font-black uppercase tracking-wide text-emerald-700">Ze žádosti</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <button class="btn-primary w-full" type="button" @click="copyExistingResetLink(asResetLink(row))">Kopírovat odkaz</button>
              <button class="btn-secondary w-full" type="button" :disabled="loading" @click="invalidateResetLink(asResetLink(row))">Zneplatnit</button>
            </div>
          </div>
        </template>

        <template #cell-customerName="{ row }">
          <span class="font-black">{{ asResetLink(row).customerName }}</span>
        </template>
        <template #cell-createdAt="{ row }">{{ formatDateTime(asResetLink(row).createdAt) }}</template>
        <template #cell-expiresAt="{ row }">{{ formatDateTime(asResetLink(row).expiresAt) }}</template>
        <template #cell-source="{ row }">{{ asResetLink(row).requestId ? 'ze žádosti' : 'ručně' }}</template>
        <template #cell-actions="{ row }">
          <div class="flex justify-end gap-2">
            <button class="btn-primary px-4 py-2 text-sm" type="button" @click="copyExistingResetLink(asResetLink(row))">Kopírovat odkaz</button>
            <button class="btn-secondary px-4 py-2 text-sm" type="button" :disabled="loading" @click="invalidateResetLink(asResetLink(row))">Zneplatnit</button>
          </div>
        </template>
      </DataTable>

      <DataTable
        v-else
        class="mt-6"
        :rows="activeResetRequests"
        :columns="requestColumns"
        row-key="id"
        empty-text="Žádné čekající žádosti."
        filter-placeholder="Filtrovat podle uživatele nebo data..."
        show-refresh
        :refreshing="dataLoading"
        @refresh="refreshUsersData(true)"
      >
        <template #mobile-row="{ row }">
          <div class="space-y-4">
            <div>
              <p class="text-xl font-black text-stone-950">{{ asResetRequest(row).customerName }}</p>
              <p class="text-sm font-bold text-stone-600">Vytvořeno {{ formatDateTime(asResetRequest(row).createdAt) }}</p>
              <p class="text-sm font-bold" :class="isExpired(asResetRequest(row)) ? 'text-red-700' : 'text-honey-700'">Platí do {{ formatDateTime(asResetRequest(row).expiresAt) }}</p>
            </div>
            <UserPasswordActions
              :customer="requestCustomer(asResetRequest(row))"
              :password="requestPasswords[asResetRequest(row).id] ?? ''"
              :loading="loading || isExpired(asResetRequest(row))"
              :show-reset-url="false"
              @update:password="requestPasswords[asResetRequest(row).id] = $event"
              @reset="resetRequestPassword(asResetRequest(row))"
              @link="createRequestResetLink(asResetRequest(row))"
            />
            <button class="btn-secondary w-full" type="button" :disabled="loading" @click="rejectResetRequest(asResetRequest(row))">Odmítnout</button>
          </div>
        </template>

        <template #cell-customerName="{ row }"><span class="font-black">{{ asResetRequest(row).customerName }}</span></template>
        <template #cell-createdAt="{ row }">{{ formatDateTime(asResetRequest(row).createdAt) }}</template>
        <template #cell-expiresAt="{ row }"><span :class="isExpired(asResetRequest(row)) ? 'font-bold text-red-700' : ''">{{ formatDateTime(asResetRequest(row).expiresAt) }}</span></template>
        <template #cell-actions="{ row }">
          <div class="min-w-[560px] space-y-2">
            <UserPasswordActions
              :customer="requestCustomer(asResetRequest(row))"
              :password="requestPasswords[asResetRequest(row).id] ?? ''"
              :loading="loading || isExpired(asResetRequest(row))"
              :show-reset-url="false"
              @update:password="requestPasswords[asResetRequest(row).id] = $event"
              @reset="resetRequestPassword(asResetRequest(row))"
              @link="createRequestResetLink(asResetRequest(row))"
            />
            <button class="btn-secondary px-4 py-2 text-sm" type="button" :disabled="loading" @click="rejectResetRequest(asResetRequest(row))">Odmítnout</button>
          </div>
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
import {
  adminCreatePasswordResetLink,
  adminCreateRequestResetLink,
  adminInvalidatePasswordResetLink,
  adminRejectPasswordResetRequest,
  adminResetPassword,
  adminSetRequestPassword,
  getAdminPasswordResetLinks,
  getAdminPasswordResetRequests,
  type PasswordResetLink,
  type PasswordResetRequest
} from "../api";
import DataTable, { type DataTableColumn } from "../components/DataTable.vue";
import UserPasswordActions, { type UserPasswordCustomer } from "../components/UserPasswordActions.vue";
import { useAutoRefresh } from "../composables/useAutoRefresh";
import { confirmAction, confirmDanger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useSessionStore } from "../stores/session";
import { copyToClipboard } from "../utils/clipboard";
import { dateOnly, dateTime } from "../utils/format";

type Customer = UserPasswordCustomer;

const admin = useAdminStore();
const session = useSessionStore();
const loading = ref(false);
const dataLoading = ref(false);
const activeTab = ref<"users" | "reset-links" | "requests">("users");
const passwordResets = reactive<Record<string, string>>({});
const requestPasswords = reactive<Record<string, string>>({});
const activeResetLinks = ref<PasswordResetLink[]>([]);
const activeResetRequests = ref<PasswordResetRequest[]>([]);
const customers = computed(() => admin.dashboard?.customers.filter((customer) => customer.id !== session.profile?.customer.id) ?? []);
const activeResetLinkCount = computed(() => admin.dashboard?.totals.activePasswordResetLinks ?? activeResetLinks.value.length);
const pendingResetRequestCount = computed(() => admin.dashboard?.totals.pendingPasswordResetRequests ?? activeResetRequests.value.length);
const columns: DataTableColumn[] = [
  { key: "name", label: "Jméno", sortable: true, getSortValue: (row) => asCustomer(row).name, getFilterValue: (row) => asCustomer(row).name },
  { key: "createdAt", label: "Vytvořeno", sortable: true, getSortValue: (row) => new Date(asCustomer(row).createdAt), getFilterValue: (row) => formatDate(asCustomer(row).createdAt) },
  { key: "actions", label: "Akce" }
];
const resetLinkColumns: DataTableColumn[] = [
  { key: "customerName", label: "Uživatel", sortable: true, getSortValue: (row) => asResetLink(row).customerName, getFilterValue: (row) => asResetLink(row).customerName },
  { key: "createdAt", label: "Vytvořeno", sortable: true, getSortValue: (row) => new Date(asResetLink(row).createdAt), getFilterValue: (row) => formatDateTime(asResetLink(row).createdAt) },
  { key: "expiresAt", label: "Platí do", sortable: true, getSortValue: (row) => new Date(asResetLink(row).expiresAt), getFilterValue: (row) => formatDateTime(asResetLink(row).expiresAt) },
  { key: "source", label: "Původ", sortable: true, getSortValue: (row) => (asResetLink(row).requestId ? "ze žádosti" : "ručně"), getFilterValue: (row) => (asResetLink(row).requestId ? "ze žádosti" : "ručně") },
  { key: "actions", label: "Akce", align: "right" }
];
const requestColumns: DataTableColumn[] = [
  { key: "customerName", label: "Uživatel", sortable: true, getSortValue: (row) => asResetRequest(row).customerName, getFilterValue: (row) => asResetRequest(row).customerName },
  { key: "createdAt", label: "Vytvořeno", sortable: true, getSortValue: (row) => new Date(asResetRequest(row).createdAt), getFilterValue: (row) => formatDateTime(asResetRequest(row).createdAt) },
  { key: "expiresAt", label: "Platí do", sortable: true, getSortValue: (row) => new Date(asResetRequest(row).expiresAt), getFilterValue: (row) => formatDateTime(asResetRequest(row).expiresAt) },
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
    await loadResetData();
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
    await loadResetLinks();
    const copied = await copyToClipboard(response.resetUrl);
    push.success(copied ? "Reset odkaz je vytvořený a zkopírovaný." : "Reset odkaz je vytvořený. Najdeš ho v tabu Reset odkazy.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Reset odkaz se nepodařilo vytvořit.");
  } finally {
    loading.value = false;
  }
}

async function createRequestResetLink(request: PasswordResetRequest) {
  const confirmed = await confirmAction({
    title: "Vytvořit reset odkaz?",
    text: `Odkaz pro ${request.customerName} bude platit 24 hodin a žádost se označí jako vyřešená.`,
    confirmText: "Ano, vytvořit",
    icon: "question"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    const response = await adminCreateRequestResetLink(session.sessionToken, request.id);
    await loadResetData();
    activeTab.value = "reset-links";
    const copied = await copyToClipboard(response.resetUrl);
    push.success(copied ? "Reset odkaz je vytvořený a zkopírovaný." : "Reset odkaz je vytvořený. Zkopíruj ho v tabu Reset odkazy.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Reset odkaz se nepodařilo vytvořit.");
  } finally {
    loading.value = false;
  }
}

async function resetRequestPassword(request: PasswordResetRequest) {
  const password = requestPasswords[request.id] ?? "";
  const confirmed = await confirmDanger({
    title: "Nastavit nové heslo?",
    text: `Uživatel ${request.customerName} bude odhlášený ze všech zařízení a žádost se označí jako vyřešená.`,
    confirmText: "Ano, nastavit"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    await adminSetRequestPassword(session.sessionToken, request.id, password);
    requestPasswords[request.id] = "";
    await loadResetData();
    push.success("Heslo je nastavené.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Heslo se nepodařilo nastavit.");
  } finally {
    loading.value = false;
  }
}

async function rejectResetRequest(request: PasswordResetRequest) {
  const confirmed = await confirmDanger({
    title: "Odmítnout žádost?",
    text: `Žádost pro ${request.customerName} se označí jako odmítnutá.`,
    confirmText: "Ano, odmítnout"
  });

  if (!confirmed) {
    return;
  }

  loading.value = true;

  try {
    await adminRejectPasswordResetRequest(session.sessionToken, request.id);
    await loadResetRequests();
    push.success("Žádost je odmítnutá.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Žádost se nepodařilo odmítnout.");
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

async function loadResetRequests() {
  if (!session.isAdmin) {
    activeResetRequests.value = [];
    return;
  }

  activeResetRequests.value = (await getAdminPasswordResetRequests(session.sessionToken)).requests;
}

async function loadResetData() {
  await Promise.all([loadResetLinks(), loadResetRequests()]);
}

async function refreshUsersData(showToast = false) {
  if (!session.isAdmin) {
    activeResetLinks.value = [];
    activeResetRequests.value = [];
    return;
  }

  dataLoading.value = true;

  try {
    await Promise.all([admin.refresh(session.sessionToken), loadResetData()]);

    if (showToast) {
      push.success("Data jsou obnovená.");
    }
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Data se nepodařilo obnovit.");
  } finally {
    dataLoading.value = false;
  }
}

function setActiveTab(tab: "users" | "reset-links" | "requests") {
  activeTab.value = tab;
  void refreshUsersData();
}

async function copyExistingResetLink(link: PasswordResetLink) {
  if (await copyToClipboard(link.resetUrl)) {
    push.success("Odkaz je zkopírovaný.");
    return;
  }

  push.error("Odkaz se nepodařilo zkopírovat.");
}

function asCustomer(row: unknown) {
  return row as Customer;
}

function asResetLink(row: unknown) {
  return row as PasswordResetLink;
}

function asResetRequest(row: unknown) {
  return row as PasswordResetRequest;
}

function requestCustomer(request: PasswordResetRequest): Customer {
  return { id: request.customerId, name: request.customerName, createdAt: request.createdAt };
}

function isExpired(request: PasswordResetRequest) {
  return new Date(request.expiresAt).getTime() <= Date.now();
}

function formatDate(value: string) {
  return dateOnly(value);
}

function formatDateTime(value: string) {
  return dateTime(value);
}

onMounted(async () => {
  if (session.isAdmin) {
    await refreshUsersData();
  }
});
useAutoRefresh(async () => {
  await refreshUsersData();
}, 30_000);
</script>
