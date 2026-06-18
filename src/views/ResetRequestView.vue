<template>
  <section class="relative z-10 mx-auto max-w-4xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel">
      <p class="section-kicker">Admin</p>
      <h1 class="section-title">Žádost o reset hesla</h1>

      <div v-if="!session.isAdmin" class="mt-6 rounded-3xl bg-honey-50 p-5 ring-1 ring-honey-100">
        <h2 class="text-2xl font-black text-stone-950">Nejdřív se přihlas jako admin</h2>
        <p class="mt-2 text-stone-600">Po přihlášení se vrať na tento odkaz a žádost vyřeš.</p>
        <RouterLink class="btn-primary mt-4 inline-flex" to="/mujmed">Přihlásit přes Můj med</RouterLink>
      </div>

      <div v-else-if="loading" class="mt-6 rounded-3xl bg-honey-50 p-5 font-bold text-stone-700 ring-1 ring-honey-100">Načítám žádost...</div>

      <div v-else-if="error" class="mt-6 rounded-3xl bg-red-100 p-5 font-bold text-red-900">{{ error }}</div>

      <div v-else-if="request" class="mt-6 space-y-5">
        <div class="rounded-3xl bg-honey-100 p-5 ring-1 ring-honey-200">
          <h2 class="text-2xl font-black text-stone-950">{{ request.customerName }}</h2>
          <p class="mt-1 text-sm font-bold text-honey-800">Vytvořeno {{ formatDateTime(request.createdAt) }} · platí do {{ formatDateTime(request.expiresAt) }}</p>
        </div>

        <UserPasswordActions
          :customer="requestCustomer"
          :password="password"
          :reset-url="resetUrl"
          :loading="actionLoading"
          @update:password="password = $event"
          @reset="setPassword"
          @link="createLink"
          @copy="copyLink"
        />

        <button class="btn-secondary" type="button" :disabled="actionLoading" @click="rejectRequest">Odmítnout žádost</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { adminCreateRequestResetLink, adminRejectPasswordResetRequest, adminSetRequestPassword, getAdminPasswordResetRequest, type PasswordResetRequest } from "../api";
import UserPasswordActions from "../components/UserPasswordActions.vue";
import { confirmAction, confirmDanger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useSessionStore } from "../stores/session";
import { copyToClipboard } from "../utils/clipboard";
import { dateTime } from "../utils/format";

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();
const session = useSessionStore();
const request = ref<PasswordResetRequest | null>(null);
const password = ref("");
const resetUrl = ref("");
const loading = ref(false);
const actionLoading = ref(false);
const error = ref("");
const requestCustomer = computed(() => ({ id: request.value?.customerId ?? "", name: request.value?.customerName ?? "", createdAt: request.value?.createdAt ?? "" }));

function requestIdParam() {
  return typeof route.params.requestId === "string" ? route.params.requestId : "";
}

function tokenParam() {
  return typeof route.params.token === "string" ? route.params.token : "";
}

async function loadRequest() {
  if (!session.isAdmin) {
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    if (!admin.dashboard) {
      await admin.refresh(session.sessionToken);
    }

    request.value = (await getAdminPasswordResetRequest(session.sessionToken, requestIdParam(), tokenParam())).request;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : "Žádost se nepodařilo načíst.";
  } finally {
    loading.value = false;
  }
}

async function createLink() {
  if (!request.value) {
    return;
  }

  const confirmed = await confirmAction({ title: "Vytvořit reset odkaz?", text: `Odkaz pro ${request.value.customerName} bude platit 24 hodin.`, confirmText: "Ano, vytvořit" });

  if (!confirmed) {
    return;
  }

  actionLoading.value = true;

  try {
    const response = await adminCreateRequestResetLink(session.sessionToken, request.value.id);
    resetUrl.value = response.resetUrl;
    await admin.refresh(session.sessionToken);
    push.success("Reset odkaz je vytvořený.");
  } catch (actionError) {
    push.error(actionError instanceof Error ? actionError.message : "Reset odkaz se nepodařilo vytvořit.");
  } finally {
    actionLoading.value = false;
  }
}

async function setPassword() {
  if (!request.value) {
    return;
  }

  const confirmed = await confirmDanger({ title: "Nastavit nové heslo?", text: `Uživatel ${request.value.customerName} bude odhlášený ze všech zařízení.`, confirmText: "Ano, nastavit" });

  if (!confirmed) {
    return;
  }

  actionLoading.value = true;

  try {
    await adminSetRequestPassword(session.sessionToken, request.value.id, password.value);
    password.value = "";
    await admin.refresh(session.sessionToken);
    push.success("Heslo je nastavené.");
    await router.push("/uzivatele");
  } catch (actionError) {
    push.error(actionError instanceof Error ? actionError.message : "Heslo se nepodařilo nastavit.");
  } finally {
    actionLoading.value = false;
  }
}

async function rejectRequest() {
  if (!request.value) {
    return;
  }

  const confirmed = await confirmDanger({ title: "Odmítnout žádost?", text: `Žádost pro ${request.value.customerName} se zneplatní.`, confirmText: "Ano, odmítnout" });

  if (!confirmed) {
    return;
  }

  actionLoading.value = true;

  try {
    await adminRejectPasswordResetRequest(session.sessionToken, request.value.id);
    await admin.refresh(session.sessionToken);
    push.success("Žádost je odmítnutá.");
    await router.push("/uzivatele");
  } catch (actionError) {
    push.error(actionError instanceof Error ? actionError.message : "Žádost se nepodařilo odmítnout.");
  } finally {
    actionLoading.value = false;
  }
}

async function copyLink() {
  if (await copyToClipboard(resetUrl.value)) {
    push.success("Odkaz je zkopírovaný.");
    return;
  }

  push.error("Odkaz se nepodařilo zkopírovat.");
}

function formatDateTime(value: string) {
  return dateTime(value);
}

onMounted(() => {
  void loadRequest();
});
watch(() => session.isAdmin, (isAdmin) => {
  if (isAdmin && !request.value) {
    void loadRequest();
  }
});
</script>
