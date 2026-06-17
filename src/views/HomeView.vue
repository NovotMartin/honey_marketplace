<template>
  <section class="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <div class="rounded-[2rem] border-4 border-white/80 bg-white/75 p-6 shadow-honey backdrop-blur sm:p-9">
      <div class="max-w-4xl space-y-5 text-lg leading-relaxed text-stone-700 sm:text-xl">
        <p class="inline-flex rounded-full bg-honey-200 px-4 py-2 text-sm font-black uppercase tracking-wide text-honey-800 sm:text-base">
          🍯 Domácí BIO řemeslný 100% organic homemade med 🐝
        </p>
        <p>Ahoj, švagr včelaří a stejně jako minulý rok jsem přivezl pár sklenic medu.</p>
        <p>
          Tentokrát jsem věřil, že se to rozebere, tak jsem rovnou vzal
          <strong class="rounded-2xl bg-honey-200 px-3 py-1 font-black text-honey-800">{{ formatJarCount(market.totalJars) }}</strong>.
        </p>
        <p>A protože jsem špatný překupník, tak je cena:</p>
        <p class="rounded-[1.75rem] bg-stone-950 p-5 text-white shadow-xl">
          <strong class="block pt-2 font-display text-4xl font-black text-honey-300 sm:text-5xl">
            {{ money(market.publicState?.settings.pricePerJarCzk ?? 200) }} za kilo
          </strong>
        </p>
      </div>

      <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <div class="stat-card">
          <span>Volné</span>
          <strong>{{ formatJarCount(market.availableJars) }}</strong>
        </div>
        <div class="stat-card">
          <span>Rezervováno</span>
          <strong>{{ formatJarCount(market.publicState?.totalReservedJars ?? 0) }}</strong>
        </div>
        <div class="stat-card">
          <span>Cena za kus</span>
          <strong>{{ money(market.publicState?.settings.pricePerJarCzk ?? 0) }}</strong>
        </div>
      </div>

      <div class="mt-8 rounded-3xl bg-stone-950 p-4 text-white shadow-xl">
        <div class="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-honey-100">
          <span>Stav zásob</span>
          <span>{{ market.progressPercent }} % pryč</span>
        </div>
        <div class="h-5 overflow-hidden rounded-full bg-white/20">
          <div class="h-full rounded-full bg-gradient-to-r from-honey-300 via-honey-400 to-orange-500 transition-all" :style="{ width: `${market.progressPercent}%` }"></div>
        </div>
      </div>

      <div class="mt-8 flex flex-col gap-3 sm:flex-row">
        <RouterLink class="btn-primary text-center text-lg" :class="!market.canReserve ? 'pointer-events-none opacity-50' : ''" to="/chcimed">
          {{ market.canReserve ? "Chci med" : "Med je vyprodaný" }}
        </RouterLink>
        <RouterLink class="btn-secondary text-center text-lg" to="/mujmed">Můj med</RouterLink>
      </div>
    </div>
  </section>

  <section class="relative z-10 mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
    <PublicCustomerTable :customers="market.publicState?.customers ?? []" :selectable="!session.isLoggedIn" @select="selectCustomer" />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import PublicCustomerTable from "../components/PublicCustomerTable.vue";
import { useAutoRefresh } from "../composables/useAutoRefresh";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";
import { formatJarCount, money } from "../utils/format";

const market = useMarketStore();
const router = useRouter();
const session = useSessionStore();

onMounted(() => {
  void market.refresh();
});
useAutoRefresh(() => market.refresh(), 30_000);

function selectCustomer(name: string) {
  if (session.isLoggedIn) {
    return;
  }

  router.push({ path: "/mujmed", query: { name } });
}
</script>
