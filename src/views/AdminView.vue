<template>
  <section class="relative z-10 mx-auto max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="section-kicker">Admin</p>
          <h1 class="section-title">Správa medu</h1>
        </div>
        <span v-if="session.isAdmin" class="rounded-full bg-honey-100 px-4 py-2 text-sm font-black text-honey-800">Přihlášený admin: {{ session.customerName }}</span>
      </div>

      <div v-if="!session.isAdmin" class="mt-5 rounded-3xl bg-honey-50 p-5 ring-1 ring-honey-100">
        <h2 class="text-2xl font-black text-stone-950">Administrace je zamčená</h2>
        <p class="mt-2 text-stone-600">Přihlas se jako admin přes Můj med. Teprve potom se zobrazí nastavení a odkazy v menu.</p>
        <RouterLink class="btn-primary mt-4 inline-flex" to="/mujmed">Přihlásit přes Můj med</RouterLink>
      </div>

      <div v-else-if="admin.dashboard" class="mt-6 grid gap-6">
        <form class="admin-card" @submit.prevent="submitSettings">
          <h3 class="admin-title">Nastavení prodeje</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="admin-field">Celkem medu
              <span class="flex gap-2">
                <input v-model.number="settingsForm.totalJars" class="input text-stone-900" type="number" min="0" />
                <button v-tooltip="'Doskladnit'" class="btn-secondary px-4" type="button" :disabled="loading" aria-label="Doskladnit" title="Doskladnit" @click="restockHoney">
                  <PackagePlus class="h-5 w-5" aria-hidden="true" />
                </button>
              </span>
            </label>
            <label class="admin-field">Cena za kus CZK<input v-model.number="settingsForm.pricePerJarCzk" class="input text-stone-900" type="number" min="0" /></label>
            <label class="admin-field sm:col-span-2">IBAN<input v-model="settingsForm.iban" class="input text-stone-900" /></label>
            <label class="admin-field">SWIFT / BIC<input v-model="settingsForm.swift" class="input text-stone-900" /></label>
            <label class="admin-field">Revolut username<input v-model="settingsForm.revolutUsername" class="input text-stone-900" /></label>
            <label class="admin-field sm:col-span-2">Revolut.me odkaz<input v-model="settingsForm.revolutLink" class="input text-stone-900" placeholder="https://revolut.me/..." /></label>
            <label class="admin-field sm:col-span-2">Zpráva k platbě<input v-model="settingsForm.paymentMessage" class="input text-stone-900" /></label>
          </div>
          <div class="mt-4 flex flex-wrap gap-3">
            <button class="btn-save" type="submit" :disabled="loading">Uložit nastavení</button>
          </div>
        </form>

        <div class="admin-card">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="admin-title">E-mail notifikace</h3>
              <p class="text-sm text-stone-600">SMTP hodnoty se nastavují v Docker Compose nebo `.env`. Heslo a podpisový token se nezobrazují.</p>
            </div>
            <span class="rounded-full px-3 py-1 text-xs font-black" :class="admin.dashboard.mailSettings.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">
              {{ admin.dashboard.mailSettings.enabled ? 'Zapnuto' : 'Nedokončeno' }}
            </span>
          </div>

          <div class="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>SMTP server</strong><br />{{ valueOrUnset(admin.dashboard.mailSettings.host) }}:{{ admin.dashboard.mailSettings.port }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>Secure</strong><br />{{ admin.dashboard.mailSettings.secure ? 'SSL/TLS' : 'STARTTLS / ne' }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>SMTP uživatel</strong><br />{{ valueOrUnset(admin.dashboard.mailSettings.user) }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>Odesílatel</strong><br />{{ valueOrUnset(admin.dashboard.mailSettings.from) }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>Admin e-mail</strong><br />{{ valueOrUnset(admin.dashboard.mailSettings.adminEmail) }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>Veřejná URL</strong><br />{{ valueOrUnset(admin.dashboard.mailSettings.appPublicUrl) }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>SMTP heslo</strong><br />{{ admin.dashboard.mailSettings.hasPassword ? 'nastaveno' : 'nenastaveno' }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>Token odkazu</strong><br />{{ admin.dashboard.mailSettings.hasActionSecret ? 'nastaveno' : 'nenastaveno' }}</div>
            <div class="rounded-2xl bg-honey-50 p-3 ring-1 ring-honey-100"><strong>Platnost odkazu</strong><br />{{ admin.dashboard.mailSettings.confirmLinkTtlHours }} h</div>
          </div>

          <div v-if="admin.dashboard.mailSettings.missing.length" class="mt-4 rounded-2xl bg-amber-100 p-3 text-sm font-bold text-amber-900">
            Chybí: {{ admin.dashboard.mailSettings.missing.join(', ') }}
          </div>

          <form class="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" @submit.prevent="submitTestEmail">
            <input v-model="testEmailTo" class="input text-stone-900" type="email" placeholder="Kam poslat testovací e-mail" required />
            <button class="btn-save" type="submit" :disabled="loading">Odeslat test</button>
          </form>
          <div v-if="testEmailResult" class="mt-3 rounded-2xl bg-emerald-100 p-3 text-sm font-bold text-emerald-900">{{ testEmailResult }}</div>
          <div v-if="testEmailError" class="mt-3 rounded-2xl bg-red-100 p-3 text-sm font-bold text-red-900">{{ testEmailError }}</div>
        </div>
      </div>

      <div v-else class="mt-5 rounded-3xl bg-honey-50 p-5 font-bold text-stone-700 ring-1 ring-honey-100">Načítám administraci...</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { PackagePlus } from "lucide-vue-next";
import { onMounted, reactive, ref, watch } from "vue";
import { adminRestockHoney, adminSendTestEmail, saveAdminSettings, type AdminDashboard, type AdminSettings } from "../api";
import { useAutoRefresh } from "../composables/useAutoRefresh";
import { promptPositiveInteger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";

type SettingsForm = Omit<AdminSettings, "id" | "updatedAt">;

const admin = useAdminStore();
const market = useMarketStore();
const session = useSessionStore();
const loading = ref(false);
const testEmailTo = ref("");
const testEmailResult = ref("");
const testEmailError = ref("");
const settingsForm = reactive<SettingsForm>({
  totalJars: 100,
  pricePerJarCzk: 200,
  iban: "",
  swift: "",
  revolutUsername: "",
  revolutLink: "",
  paymentMessage: "Platba za med"
});

function syncDashboard(dashboard: AdminDashboard | null) {
  if (!dashboard) {
    return;
  }

  settingsForm.totalJars = dashboard.settings.totalJars;
  settingsForm.pricePerJarCzk = dashboard.settings.pricePerJarCzk;
  settingsForm.iban = dashboard.settings.iban;
  settingsForm.swift = dashboard.settings.swift;
  settingsForm.revolutUsername = dashboard.settings.revolutUsername;
  settingsForm.revolutLink = dashboard.settings.revolutLink;
  settingsForm.paymentMessage = dashboard.settings.paymentMessage;
}

async function submitSettings() {
  loading.value = true;

  try {
    const response = await saveAdminSettings(session.sessionToken, { ...settingsForm });
    market.setPublicState(response.publicState);
    await admin.refresh(session.sessionToken);
    syncDashboard(admin.dashboard);
    push.success("Nastavení je uložené.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Nastavení se nepodařilo uložit.");
  } finally {
    loading.value = false;
  }
}

async function restockHoney() {
  const amount = await promptPositiveInteger({
    title: "Doskladnit med",
    text: "Kolik sklenic chceš přičíst k aktuálnímu množství?",
    confirmText: "Doskladnit"
  });

  if (!amount) {
    return;
  }

  loading.value = true;

  try {
    const response = await adminRestockHoney(session.sessionToken, amount);
    market.setPublicState(response.publicState);
    await admin.refresh(session.sessionToken);
    syncDashboard(admin.dashboard);
    push.success(`Doskladněno ${amount} sklenic medu.`);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Med se nepodařilo doskladnit.");
  } finally {
    loading.value = false;
  }
}

async function submitTestEmail() {
  loading.value = true;
  testEmailResult.value = "";
  testEmailError.value = "";

  try {
    const response = await adminSendTestEmail(session.sessionToken, testEmailTo.value);

    if (admin.dashboard) {
      admin.dashboard.mailSettings = response.mailSettings;
    }

    testEmailResult.value = response.message;
    push.success(response.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Testovací e-mail se nepodařilo odeslat.";
    testEmailError.value = message;
    push.error(message);
  } finally {
    loading.value = false;
  }
}

function valueOrUnset(value: string) {
  return value || "nenastaveno";
}

watch(() => admin.dashboard, syncDashboard, { immediate: true });

onMounted(async () => {
  if (session.isAdmin) {
    await admin.refresh(session.sessionToken).catch((error) => push.error(error instanceof Error ? error.message : "Administraci se nepodařilo načíst."));
  }
});
useAutoRefresh(() => (session.isAdmin ? admin.refresh(session.sessionToken) : undefined), 30_000);
</script>
