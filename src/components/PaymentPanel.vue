<template>
  <div id="platba" class="panel border-4 border-emerald-200 bg-emerald-50">
    <p class="text-sm font-black uppercase tracking-[0.25em] text-emerald-700">
      {{ payment.kind === "created" ? "Rezervace vytvořena" : "Platba" }}
    </p>
    <h2 class="mt-2 font-display text-3xl font-black text-stone-950">
      {{ formatJarCount(payment.order.jarCount) }} pro {{ payment.order.customerName }}
    </h2>
    <p class="mt-2 text-stone-700">Částka k úhradě: {{ money(payment.payment.amountCzk) }}</p>

    <div class="mt-6 grid gap-4 md:grid-cols-2">
      <div v-if="payment.payment.bankQr" class="qr-card">
        <p class="font-black text-stone-900">Bankovní QR</p>
        <img :src="payment.payment.bankQr" alt="Bankovní QR platba" />
        <p class="text-sm text-stone-600">Částka k úhradě: {{ money(payment.payment.amountCzk) }}</p>
      </div>
      <div v-if="payment.payment.revolutQr" class="qr-card">
        <p class="font-black text-stone-900">Revolut</p>
        <img :src="payment.payment.revolutQr" alt="Revolut QR platba" />
        <a class="font-bold text-amber-800 underline" :href="payment.payment.revolutLink ?? '#'" target="_blank" rel="noreferrer">Otevřít Revolut</a>
      </div>
    </div>

    <p v-if="!payment.payment.bankQr && !payment.payment.revolutQr" class="mt-4 rounded-2xl bg-white/70 p-4 font-bold text-stone-700">
      Platba zatím není nastavená. QR se zobrazí po doplnění platebních údajů v administraci.
    </p>

    <div class="mt-6 flex flex-wrap gap-3">
      <AnotherOrderButton @another="$emit('another')" />
      <button class="btn-secondary" type="button" @click="$emit('clear')">Skrýt platbu</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import AnotherOrderButton from "./AnotherOrderButton.vue";
import type { RecentPayment } from "../stores/checkout";
import { formatJarCount, money } from "../utils/format";

defineProps<{ payment: RecentPayment }>();
defineEmits<{ another: []; clear: [] }>();

</script>
