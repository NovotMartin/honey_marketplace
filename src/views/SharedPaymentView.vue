<template>
  <section class="relative z-10 mx-auto max-w-4xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div v-if="loading" class="panel text-center">
      <p class="section-kicker">Platba</p>
      <h1 class="section-title">Načítám platební údaje...</h1>
    </div>

    <div v-else-if="error" class="panel text-center">
      <p class="section-kicker">Platba</p>
      <h1 class="section-title">Odkaz nejde otevřít</h1>
      <p class="mt-3 text-stone-600">{{ error }}</p>
      <RouterLink class="btn-secondary mt-5 inline-flex" to="/">Zpět na med</RouterLink>
    </div>

    <div v-else-if="sharedPayment" class="panel border-4 border-honey-200 bg-white/85">
      <p class="section-kicker">Sdílená platba</p>
      <h1 class="section-title">Platba za med</h1>

      <div class="mt-6 rounded-[2rem] bg-honey-100 p-5">
        <p class="text-sm font-black uppercase tracking-[0.2em] text-honey-800">Kdo a za co</p>
        <h2 class="mt-2 font-display text-3xl font-black text-stone-950">{{ sharedPayment.order.customerName }}</h2>
        <p class="mt-2 text-lg font-bold text-stone-700">
          {{ formatJarCount(sharedPayment.order.jarCount) }} medu · {{ statusLabel(sharedPayment.order.status) }}
        </p>
        <p class="mt-4 rounded-[1.5rem] bg-stone-950 p-4 font-display text-4xl font-black text-honey-300">
          {{ money(sharedPayment.payment.amountCzk) }}
        </p>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
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

      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink class="btn-secondary" to="/">Zpět na med</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { getSharedPayment, type SharedPayment } from "../api";
import { formatJarCount, money } from "../utils/format";

const route = useRoute();
const sharedPayment = ref<SharedPayment | null>(null);
const loading = ref(true);
const error = ref("");

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function loadSharedPayment() {
  const orderId = paramValue(route.params.orderId);
  const token = paramValue(route.params.token);

  if (!orderId || !token) {
    error.value = "V odkazu chybí identifikátor platby.";
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    sharedPayment.value = await getSharedPayment(orderId, token);
  } catch (requestError) {
    sharedPayment.value = null;
    error.value = requestError instanceof Error ? requestError.message : "Platební odkaz není platný.";
  } finally {
    loading.value = false;
  }
}

function statusLabel(status: SharedPayment["order"]["status"]) {
  return { PENDING: "čeká na potvrzení", CONFIRMED: "potvrzeno", CANCELLED: "zrušeno" }[status];
}

watch(() => [route.params.orderId, route.params.token], () => void loadSharedPayment());
onMounted(() => void loadSharedPayment());
</script>
