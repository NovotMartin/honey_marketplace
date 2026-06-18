<template>
  <section v-if="session.isAdmin && admin.dashboard" class="relative z-10 mx-auto max-w-7xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="section-kicker">Admin</p>
          <h1 class="section-title">Objednávky</h1>
        </div>
        <span class="rounded-full bg-honey-100 px-4 py-2 text-sm font-black text-honey-800">Volné: {{ formatJarCount(admin.dashboard.totals.availableJars) }}</span>
      </div>

      <form class="admin-card mt-6" @submit.prevent="submitAdminOrder">
        <h3 class="admin-title">Osobní / offline objednávka</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <input v-model="adminOrder.name" class="input text-stone-900" placeholder="Jméno" required />
          <input v-model.number="adminOrder.jarCount" class="input text-stone-900" type="number" min="1" required />
          <PasswordInput v-model="adminOrder.password" class="sm:col-span-2" input-class="text-stone-900" placeholder="Volitelné heslo pro nový profil" autocomplete="new-password" />
          <label class="flex items-center gap-2 text-sm font-bold text-stone-700 sm:col-span-2">
            <input v-model="adminOrder.confirmed" type="checkbox" /> Rovnou potvrdit
          </label>
        </div>
        <button class="btn-save mt-4" type="submit">Zapsat objednávku</button>
      </form>

      <div v-if="sharedPayment" id="admin-sdilena-platba" class="admin-card mt-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="admin-title">Platební údaje</h3>
            <p class="text-sm font-bold text-stone-600">
              {{ sharedPayment.order.customerName }} · {{ formatJarCount(sharedPayment.order.jarCount) }} · {{ money(sharedPayment.payment.amountCzk) }}
            </p>
          </div>
          <button class="btn-secondary px-4 py-2 text-sm" type="button" @click="sharedPayment = null">Skrýt</button>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div v-if="sharedPayment.payment.bankQr" class="qr-card">
            <p class="font-black text-stone-900">Bankovní QR</p>
            <img :src="sharedPayment.payment.bankQr" alt="Bankovní QR platba" />
            <p class="text-sm text-stone-600">Částka k úhradě: {{ money(sharedPayment.payment.amountCzk) }}</p>
          </div>
          <div v-if="sharedPayment.payment.revolutQr" class="qr-card">
            <p class="font-black text-stone-900">Revolut</p>
            <img :src="sharedPayment.payment.revolutQr" alt="Revolut QR platba" />
            <a class="font-bold text-amber-800 underline" :href="sharedPayment.payment.revolutLink ?? '#'" target="_blank" rel="noreferrer">Otevřít Revolut</a>
          </div>
        </div>

        <p v-if="!sharedPayment.payment.bankQr && !sharedPayment.payment.revolutQr" class="mt-4 rounded-2xl bg-white/70 p-4 font-bold text-stone-700">
          Platební QR zatím není nastavené.
        </p>

        <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input class="input text-stone-900" :value="sharedPayment.shareUrl" readonly />
          <button class="btn-primary" type="button" @click="shareAdminPayment">Sdílet</button>
          <button class="btn-secondary" type="button" @click="copyAdminPaymentLink">Kopírovat</button>
        </div>
        <p class="mt-3 text-sm text-stone-500">Odkaz je veřejný a má náhled s QR pro WhatsApp, Teams a podobné aplikace.</p>
      </div>

      <DataTable
        class="mt-6"
        :rows="adminOrders"
        :columns="adminOrderColumns"
        :row-key="(row) => asOrder(row).id"
        empty-text="Žádné objednávky."
        filter-placeholder="Filtrovat podle jména, stavu, zdroje, data nebo částky..."
        default-sort-key="createdAt"
        default-sort-direction="desc"
        show-refresh
        :refreshing="dataLoading"
        @refresh="refreshOrdersData(true)"
      >
        <template #mobile-row="{ row }">
          <div v-if="adminEditingOrderIds[asOrder(row).id]" class="space-y-3">
            <div class="grid grid-cols-[1fr_4.5rem_auto] items-center gap-2">
              <input v-model="adminEditingOrders[asOrder(row).id].name" class="input min-w-0 text-stone-900" maxlength="80" />
              <input v-model.number="adminEditingOrders[asOrder(row).id].jarCount" class="input text-right text-stone-900" type="number" min="1" />
              <span class="whitespace-nowrap text-right font-black text-honey-700">{{ money(editableOrderAmount(asOrder(row))) }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <select v-model="adminEditingOrders[asOrder(row).id].status" class="input text-stone-900">
                <option value="PENDING">Čeká</option>
                <option value="CONFIRMED">Potvrzeno</option>
                <option value="CANCELLED">Zrušeno</option>
              </select>
              <select v-model="adminEditingOrders[asOrder(row).id].source" class="input text-stone-900">
                <option value="USER">web</option>
                <option value="ADMIN">osobně</option>
              </select>
            </div>
            <div class="flex justify-end gap-2 border-t border-honey-100 pt-3">
              <button v-tooltip="'Uložit'" class="mobile-action-btn bg-emerald-100 text-emerald-800 ring-emerald-200" type="button" title="Uložit" aria-label="Uložit" @click="updateAdminOrder(asOrder(row))">
                <Save class="h-5 w-5" />
              </button>
              <button v-tooltip="'Zahodit'" class="mobile-action-btn bg-white text-stone-700 ring-honey-200" type="button" title="Zahodit" aria-label="Zahodit" @click="cancelAdminOrderEdit(asOrder(row))">
                <Undo2 class="h-5 w-5" />
              </button>
            </div>
          </div>
          <div v-else class="space-y-3">
            <div class="grid grid-cols-[1fr_auto_auto] items-baseline gap-3">
              <p class="min-w-0 truncate text-base font-black text-stone-950">{{ asOrder(row).customerName }}</p>
              <p class="font-black text-stone-800">{{ asOrder(row).jarCount }} ks</p>
              <p class="whitespace-nowrap text-right font-black text-honey-700">{{ money(orderAmount(asOrder(row))) }}</p>
            </div>
            <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <span
                v-tooltip="sourceTitle(asOrder(row).source)"
                class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-stone-600 ring-1 ring-honey-100"
                :title="sourceTitle(asOrder(row).source)"
                :aria-label="sourceTitle(asOrder(row).source)"
              >
                <Globe v-if="asOrder(row).source === 'USER'" class="h-4 w-4" />
                <GlobeOff v-else class="h-4 w-4" />
              </span>
              <span class="inline-flex rounded-full px-3 py-1 text-xs font-black" :class="statusClass(asOrder(row).status)">{{ statusLabel(asOrder(row).status) }}</span>
              <span class="text-right text-xs font-bold text-stone-500">{{ formatDate(asOrder(row).createdAt) }}</span>
            </div>
            <div class="flex justify-end gap-2 border-t border-honey-100 pt-3">
              <button v-if="asOrder(row).status !== 'CANCELLED'" v-tooltip="'Platební údaje'" class="mobile-action-btn bg-sky-100 text-sky-800 ring-sky-200" type="button" title="Platební údaje" aria-label="Platební údaje" @click="showAdminPayment(asOrder(row))">
                <CreditCard class="h-5 w-5" />
              </button>
              <button v-tooltip="'Upravit'" class="mobile-action-btn bg-honey-100 text-honey-800 ring-honey-200" type="button" title="Upravit" aria-label="Upravit" @click="startAdminOrderEdit(asOrder(row))">
                <Pencil class="h-5 w-5" />
              </button>
              <button v-if="asOrder(row).status === 'PENDING'" v-tooltip="'Potvrdit'" class="mobile-action-btn bg-emerald-100 text-emerald-800 ring-emerald-200" type="button" title="Potvrdit" aria-label="Potvrdit" @click="confirmAdminOrder(asOrder(row))">
                <Check class="h-5 w-5" />
              </button>
              <button v-if="asOrder(row).status !== 'CANCELLED'" v-tooltip="'Zrušit'" class="mobile-action-btn bg-red-100 text-red-800 ring-red-200" type="button" title="Zrušit" aria-label="Zrušit" @click="cancelAdminOrder(asOrder(row))">
                <X class="h-5 w-5" />
              </button>
              <button v-if="asOrder(row).status === 'CANCELLED'" v-tooltip="'Smazat'" class="mobile-action-btn bg-red-100 text-red-800 ring-red-200" type="button" title="Smazat" aria-label="Smazat" @click="deleteAdminOrder(asOrder(row))">
                <Trash2 class="h-5 w-5" />
              </button>
            </div>
          </div>
        </template>

        <template #cell-name="{ row }">
          <input v-if="adminEditingOrderIds[asOrder(row).id]" v-model="adminEditingOrders[asOrder(row).id].name" class="input w-48 text-stone-900" maxlength="80" />
          <span v-else class="font-bold">{{ asOrder(row).customerName }}</span>
        </template>

        <template #cell-jarCount="{ row }">
          <input v-if="adminEditingOrderIds[asOrder(row).id]" v-model.number="adminEditingOrders[asOrder(row).id].jarCount" class="input ml-auto w-24 text-right text-stone-900" type="number" min="1" />
          <span v-else class="font-black">{{ asOrder(row).jarCount }}</span>
        </template>

        <template #cell-amount="{ row }">
          <span class="font-black text-honey-700">{{ money(adminEditingOrderIds[asOrder(row).id] ? editableOrderAmount(asOrder(row)) : orderAmount(asOrder(row))) }}</span>
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

        <template #cell-createdAt="{ row }">{{ formatDate(asOrder(row).createdAt) }}</template>

        <template #cell-actions="{ row }">
          <div v-if="adminEditingOrderIds[asOrder(row).id]" class="flex flex-wrap justify-end gap-2">
            <button v-tooltip="'Uložit'" class="mobile-action-btn bg-emerald-100 text-emerald-800 ring-emerald-200" type="button" title="Uložit" aria-label="Uložit" @click="updateAdminOrder(asOrder(row))">
              <Save class="h-5 w-5" />
            </button>
            <button v-tooltip="'Zahodit'" class="mobile-action-btn bg-white text-stone-700 ring-honey-200" type="button" title="Zahodit" aria-label="Zahodit" @click="cancelAdminOrderEdit(asOrder(row))">
              <Undo2 class="h-5 w-5" />
            </button>
          </div>
          <div v-else class="flex flex-wrap justify-end gap-3">
            <button v-if="asOrder(row).status !== 'CANCELLED'" v-tooltip="'Platební údaje'" class="mobile-action-btn bg-sky-100 text-sky-800 ring-sky-200" type="button" title="Platební údaje" aria-label="Platební údaje" @click="showAdminPayment(asOrder(row))">
              <CreditCard class="h-5 w-5" />
            </button>
            <button v-tooltip="'Upravit'" class="mobile-action-btn bg-honey-100 text-honey-800 ring-honey-200" type="button" title="Upravit" aria-label="Upravit" @click="startAdminOrderEdit(asOrder(row))">
              <Pencil class="h-5 w-5" />
            </button>
            <button v-if="asOrder(row).status === 'PENDING'" v-tooltip="'Potvrdit'" class="mobile-action-btn bg-emerald-100 text-emerald-800 ring-emerald-200" type="button" title="Potvrdit" aria-label="Potvrdit" @click="confirmAdminOrder(asOrder(row))">
              <Check class="h-5 w-5" />
            </button>
            <button v-if="asOrder(row).status !== 'CANCELLED'" v-tooltip="'Zrušit'" class="mobile-action-btn bg-red-100 text-red-800 ring-red-200" type="button" title="Zrušit" aria-label="Zrušit" @click="cancelAdminOrder(asOrder(row))">
              <X class="h-5 w-5" />
            </button>
            <button v-if="asOrder(row).status === 'CANCELLED'" v-tooltip="'Smazat'" class="mobile-action-btn bg-red-100 text-red-800 ring-red-200" type="button" title="Smazat" aria-label="Smazat" @click="deleteAdminOrder(asOrder(row))">
              <Trash2 class="h-5 w-5" />
            </button>
          </div>
        </template>
      </DataTable>
    </div>
  </section>

  <section v-else class="relative z-10 mx-auto max-w-3xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel text-center">
      <p class="section-kicker">Zamčeno</p>
      <h1 class="section-title">Objednávky jsou jen pro admina</h1>
      <p class="mt-3 text-stone-600">Nejdřív se přihlas jako admin přes Můj med.</p>
      <RouterLink class="btn-secondary mt-5 inline-flex" to="/mujmed">Přejít na Můj med</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Check, CreditCard, Globe, GlobeOff, Pencil, Save, Trash2, Undo2, X } from "lucide-vue-next";
import { push } from "notivue";
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { adminCancelOrder, adminConfirmOrder, adminCreateOrder, adminCreatePaymentShare, adminDeleteOrder, adminUpdateOrder, type Order, type PublicState, type SharedPayment } from "../api";
import DataTable, { type DataTableColumn } from "../components/DataTable.vue";
import PasswordInput from "../components/PasswordInput.vue";
import { useAutoRefresh } from "../composables/useAutoRefresh";
import { confirmAction, confirmDanger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";
import { copyToClipboard } from "../utils/clipboard";
import { dateShort, formatJarCount, money } from "../utils/format";

type AdminOrderEdit = { name: string; jarCount: number; status: Order["status"]; source: Order["source"] };

const admin = useAdminStore();
const market = useMarketStore();
const session = useSessionStore();
const adminEditingOrders = reactive<Record<string, AdminOrderEdit>>({});
const adminEditingOrderIds = reactive<Record<string, boolean>>({});
const adminOrder = reactive({ name: "", jarCount: 1, password: "", confirmed: true });
const sharedPayment = ref<SharedPayment | null>(null);
const dataLoading = ref(false);
const adminOrders = computed(() => admin.dashboard?.orders ?? []);
const hasOpenInlineEdit = computed(() => Object.values(adminEditingOrderIds).some(Boolean));
const adminOrderColumns = computed<DataTableColumn[]>(() => [
  { key: "name", label: "Jméno", sortable: true, getSortValue: (row) => asOrder(row).customerName, getFilterValue: (row) => asOrder(row).customerName },
  { key: "jarCount", label: "Množství", align: "right", sortable: true, getSortValue: (row) => asOrder(row).jarCount, getFilterValue: (row) => asOrder(row).jarCount },
  { key: "amount", label: "K úhradě", align: "right", sortable: true, getSortValue: (row) => orderAmount(asOrder(row)), getFilterValue: (row) => money(orderAmount(asOrder(row))) },
  { key: "status", label: "Stav", sortable: true, getSortValue: (row) => statusLabel(asOrder(row).status), getFilterValue: (row) => statusLabel(asOrder(row).status) },
  { key: "source", label: "Zdroj", sortable: true, getSortValue: (row) => sourceLabel(asOrder(row).source), getFilterValue: (row) => sourceLabel(asOrder(row).source) },
  { key: "createdAt", label: "Datum", sortable: true, getSortValue: (row) => new Date(asOrder(row).createdAt), getFilterValue: (row) => formatDate(asOrder(row).createdAt) },
  { key: "actions", label: "Akce", align: "right" }
]);

function syncAdminOrderEditing() {
  for (const order of admin.dashboard?.orders ?? []) {
    if (!adminEditingOrderIds[order.id]) {
      resetAdminOrderEdit(order);
    }
  }
}

function resetAdminOrderEdit(order: Order) {
  adminEditingOrders[order.id] = { name: order.customerName, jarCount: order.jarCount, status: order.status, source: order.source };
}

async function refreshAdminAndPublic(publicState?: PublicState) {
  if (publicState) {
    market.setPublicState(publicState);
  }

  await admin.refresh(session.sessionToken);
  syncAdminOrderEditing();
}

async function refreshOrdersData(showToast = false) {
  if (!session.isAdmin) {
    return;
  }

  if (hasOpenInlineEdit.value) {
    if (showToast) {
      push.info("Nejdřív dokonči nebo zahoď úpravu objednávky.");
    }
    return;
  }

  dataLoading.value = true;

  try {
    await admin.refresh(session.sessionToken);
    syncAdminOrderEditing();

    if (showToast) {
      push.success("Data jsou obnovená.");
    }
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Objednávky se nepodařilo načíst.");
  } finally {
    dataLoading.value = false;
  }
}

async function submitAdminOrder() {
  try {
    const response = await adminCreateOrder(session.sessionToken, {
      name: adminOrder.name,
      jarCount: adminOrder.jarCount,
      password: adminOrder.password || undefined,
      confirmed: adminOrder.confirmed
    });
    await refreshAdminAndPublic(response.publicState);
    adminOrder.name = "";
    adminOrder.jarCount = 1;
    adminOrder.password = "";
    push.success("Osobní objednávka je zapsaná.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Objednávku se nepodařilo zapsat.");
  }
}

async function confirmAdminOrder(order: Order) {
  const confirmed = await confirmAction({
    title: "Potvrdit objednávku?",
    text: `Objednávka pro ${order.customerName} na ${formatJarCount(order.jarCount)} se označí jako potvrzená.`,
    confirmText: "Ano, potvrdit",
    icon: "question"
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await adminConfirmOrder(session.sessionToken, order.id);
    await refreshAdminAndPublic(response.publicState);
    push.success("Objednávka je potvrzená.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Objednávku se nepodařilo potvrdit.");
  }
}

async function cancelAdminOrder(order: Order) {
  const confirmed = await confirmDanger({
    title: "Zrušit objednávku?",
    text: `Objednávka pro ${order.customerName} na ${formatJarCount(order.jarCount)} se označí jako zrušená.`,
    confirmText: "Ano, zrušit"
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await adminCancelOrder(session.sessionToken, order.id);
    await refreshAdminAndPublic(response.publicState);
    push.success("Objednávka je zrušená.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Objednávku se nepodařilo zrušit.");
  }
}

async function deleteAdminOrder(order: Order) {
  const confirmed = await confirmDanger({
    title: "Smazat zrušenou objednávku?",
    text: `Objednávka pro ${order.customerName} na ${formatJarCount(order.jarCount)} se úplně odstraní z databáze. Tahle akce nejde vrátit.`,
    confirmText: "Ano, smazat"
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await adminDeleteOrder(session.sessionToken, order.id);
    await refreshAdminAndPublic(response.publicState);
    push.success("Zrušená objednávka je smazaná.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Objednávku se nepodařilo smazat.");
  }
}

async function updateAdminOrder(order: Order) {
  const form = adminEditingOrders[order.id];

  if (!form) {
    return;
  }

  const confirmed = await confirmAction({
    title: "Uložit úpravu objednávky?",
    text: `Objednávka pro ${form.name} bude uložená jako ${formatJarCount(form.jarCount)}, stav ${statusLabel(form.status)}.`,
    confirmText: "Ano, uložit",
    icon: "question"
  });

  if (!confirmed) {
    return;
  }

  try {
    const response = await adminUpdateOrder(session.sessionToken, order.id, { ...form });
    adminEditingOrderIds[order.id] = false;
    await refreshAdminAndPublic(response.publicState);
    push.success("Objednávka je upravená.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Objednávku se nepodařilo upravit.");
  }
}

async function showAdminPayment(order: Order) {
  try {
    sharedPayment.value = await adminCreatePaymentShare(session.sessionToken, order.id);
    await nextTick();
    document.getElementById("admin-sdilena-platba")?.scrollIntoView({ behavior: "smooth", block: "start" });
    push.success("Platební údaje jsou připravené.");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Platební údaje se nepodařilo načíst.");
  }
}

async function copyAdminPaymentLink() {
  if (!sharedPayment.value) {
    return;
  }

  if (await copyToClipboard(sharedPayment.value.shareUrl)) {
    push.success("Odkaz je zkopírovaný.");
    return;
  }

  push.error("Odkaz se nepodařilo zkopírovat.");
}

async function shareAdminPayment() {
  if (!sharedPayment.value) {
    return;
  }

  const title = `Platba za med - ${sharedPayment.value.order.customerName}`;
  const text = `${formatJarCount(sharedPayment.value.order.jarCount)}, ${money(sharedPayment.value.payment.amountCzk)}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: sharedPayment.value.shareUrl });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }

  await copyAdminPaymentLink();
}

function startAdminOrderEdit(order: Order) {
  resetAdminOrderEdit(order);
  adminEditingOrderIds[order.id] = true;
}

function cancelAdminOrderEdit(order: Order) {
  resetAdminOrderEdit(order);
  adminEditingOrderIds[order.id] = false;
}

function statusLabel(status: Order["status"]) {
  return { PENDING: "Čeká na potvrzení", CONFIRMED: "Potvrzeno", CANCELLED: "Zrušeno" }[status];
}

function sourceLabel(source: Order["source"]) {
  return source === "ADMIN" ? "osobně" : "web";
}

function sourceTitle(source: Order["source"]) {
  return source === "ADMIN" ? "Offline objednávka" : "Webová objednávka";
}

function statusClass(status: Order["status"]) {
  return { PENDING: "bg-amber-100 text-amber-800", CONFIRMED: "bg-emerald-100 text-emerald-800", CANCELLED: "bg-stone-200 text-stone-600" }[status];
}

function formatDate(value: string) {
  return dateShort(value);
}

function asOrder(row: unknown) {
  return row as Order;
}

function orderAmount(order: Order) {
  return order.jarCount * (admin.dashboard?.settings.pricePerJarCzk ?? market.publicState?.settings.pricePerJarCzk ?? 0);
}

function editableOrderAmount(order: Order) {
  return (adminEditingOrders[order.id]?.jarCount ?? order.jarCount) * (admin.dashboard?.settings.pricePerJarCzk ?? 0);
}

watch(() => admin.dashboard?.orders, syncAdminOrderEditing, { immediate: true });

onMounted(async () => {
  if (session.isAdmin) {
    await refreshOrdersData();
  }
});
useAutoRefresh(() => refreshOrdersData(), 10_000);
</script>
