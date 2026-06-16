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
          <input v-model="adminOrder.password" class="input text-stone-900 sm:col-span-2" placeholder="Volitelné heslo pro nový profil" />
          <label class="flex items-center gap-2 text-sm font-bold text-stone-700 sm:col-span-2">
            <input v-model="adminOrder.confirmed" type="checkbox" /> Rovnou potvrdit
          </label>
        </div>
        <button class="btn-save mt-4" type="submit">Zapsat objednávku</button>
      </form>

      <DataTable class="mt-6" :rows="adminOrders" :columns="adminOrderColumns" :row-key="(row) => asOrder(row).id" empty-text="Žádné objednávky." filter-placeholder="Filtrovat podle jména, stavu, zdroje, data nebo částky...">
        <template #cell-name="{ row }">
          <input v-if="adminEditingOrderIds[asOrder(row).id]" v-model="adminEditingOrders[asOrder(row).id].name" class="input w-48 text-stone-900" maxlength="80" />
          <span v-else class="font-bold">{{ asOrder(row).customerName }}</span>
        </template>

        <template #cell-jarCount="{ row }">
          <input v-if="adminEditingOrderIds[asOrder(row).id]" v-model.number="adminEditingOrders[asOrder(row).id].jarCount" class="input ml-auto w-24 text-right text-stone-900" type="number" min="1" />
          <span v-else class="font-black">{{ formatJarCount(asOrder(row).jarCount) }}</span>
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
            <button class="btn-save px-4 py-2 text-sm" type="button" @click="updateAdminOrder(asOrder(row))">Uložit</button>
            <button class="btn-secondary px-4 py-2 text-sm" type="button" @click="cancelAdminOrderEdit(asOrder(row))">Zahodit</button>
          </div>
          <div v-else class="flex flex-wrap justify-end gap-3">
            <button class="text-sm font-black text-honey-700 underline" type="button" @click="startAdminOrderEdit(asOrder(row))">Upravit</button>
            <button v-if="asOrder(row).status === 'PENDING'" class="text-sm font-black text-emerald-700 underline" type="button" @click="confirmAdminOrder(asOrder(row))">Potvrdit</button>
            <button v-if="asOrder(row).status !== 'CANCELLED'" class="text-sm font-black text-red-600 underline" type="button" @click="cancelAdminOrder(asOrder(row))">Zrušit</button>
            <button v-if="asOrder(row).status === 'CANCELLED'" class="text-sm font-black text-red-700 underline" type="button" @click="deleteAdminOrder(asOrder(row))">Smazat</button>
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
import { push } from "notivue";
import { computed, onMounted, reactive, watch } from "vue";
import { adminCancelOrder, adminConfirmOrder, adminCreateOrder, adminDeleteOrder, adminUpdateOrder, type Order, type PublicState } from "../api";
import DataTable, { type DataTableColumn } from "../components/DataTable.vue";
import { confirmAction, confirmDanger } from "../services/dialog";
import { useAdminStore } from "../stores/admin";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";
import { formatJarCount, money } from "../utils/format";

type AdminOrderEdit = { name: string; jarCount: number; status: Order["status"]; source: Order["source"] };

const admin = useAdminStore();
const market = useMarketStore();
const session = useSessionStore();
const adminEditingOrders = reactive<Record<string, AdminOrderEdit>>({});
const adminEditingOrderIds = reactive<Record<string, boolean>>({});
const adminOrder = reactive({ name: "", jarCount: 1, password: "", confirmed: true });
const adminOrders = computed(() => admin.dashboard?.orders ?? []);
const adminOrderColumns = computed<DataTableColumn[]>(() => [
  { key: "name", label: "Jméno", sortable: true, getSortValue: (row) => asOrder(row).customerName, getFilterValue: (row) => asOrder(row).customerName },
  { key: "jarCount", label: "Množství", align: "right", sortable: true, getSortValue: (row) => asOrder(row).jarCount, getFilterValue: (row) => formatJarCount(asOrder(row).jarCount) },
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

function statusClass(status: Order["status"]) {
  return { PENDING: "bg-amber-100 text-amber-800", CONFIRMED: "bg-emerald-100 text-emerald-800", CANCELLED: "bg-stone-200 text-stone-600" }[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
  if (session.isAdmin && !admin.dashboard) {
    await admin.refresh(session.sessionToken).catch((error) => push.error(error instanceof Error ? error.message : "Objednávky se nepodařilo načíst."));
  }
});
</script>
