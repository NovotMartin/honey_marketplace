<template>
  <section class="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-10">
    <div class="panel self-start">
      <p class="section-kicker">Rychlá rezervace</p>
      <h1 class="section-title">Kolik sklenic medu chceš?</h1>
      <div class="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <div class="stat-card"><span>Volné</span><strong>{{ formatJarCount(market.availableJars) }}</strong></div>
        <div class="stat-card"><span>Cena za kus</span><strong>{{ money(market.publicState?.settings.pricePerJarCzk ?? 0) }}</strong></div>
        <div class="stat-card"><span>Rezervováno</span><strong>{{ formatJarCount(market.publicState?.totalReservedJars ?? 0) }}</strong></div>
      </div>
    </div>

    <form class="panel self-start" @submit.prevent="submitReservation">
      <p class="section-kicker">Chci med</p>
      <h2 class="section-title">Rezervace</h2>

      <label class="field-label" for="reserve-count">Počet sklenic</label>
      <input id="reserve-count" v-model.number="reservation.jarCount" class="input" type="number" min="1" :max="Math.max(market.availableJars, 1)" required />

      <template v-if="!session.isLoggedIn">
        <label class="field-label" for="reserve-name">Jméno v tabulce</label>
        <input id="reserve-name" v-model="reservation.name" class="input" autocomplete="name" maxlength="80" required />

        <label class="field-label" for="reserve-password">Heslo pro pozdější úpravu</label>
        <input id="reserve-password" v-model="reservation.password" class="input" type="password" autocomplete="new-password" minlength="4" required />
      </template>
      <div class="mt-5 rounded-2xl bg-honey-100 p-4 text-sm text-honey-700">
        K zaplacení: <strong>{{ money(amount) }}</strong>
      </div>

      <button class="btn-primary mt-5 w-full" type="submit" :disabled="loading || checkout.reservationComplete || !market.canReserve">
        {{ loading ? "Ukládám..." : checkout.reservationComplete ? "Rezervace vytvořená" : "Rezervovat a zobrazit QR" }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { createProfileOrder, createReservation } from "../api";
import { useCheckoutStore } from "../stores/checkout";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";
import { formatJarCount, money } from "../utils/format";

const router = useRouter();
const market = useMarketStore();
const session = useSessionStore();
const checkout = useCheckoutStore();
const loading = ref(false);
const reservation = reactive({ name: session.customerName, password: "", jarCount: 1 });
const amount = computed(() => (market.publicState?.settings.pricePerJarCzk ?? 0) * reservation.jarCount);

onMounted(() => checkout.resetForAnotherReservation());

async function submitReservation() {
  loading.value = true;

  try {
    if (session.isLoggedIn) {
      const response = await createProfileOrder(session.sessionToken, { jarCount: reservation.jarCount });
      session.setProfile(response.profile);
      market.setPublicState(response.publicState);
      checkout.setCreated(response.order, response.payment);
    } else {
      const response = await createReservation({ ...reservation });
      session.setAuthenticated({ ...response.profile, sessionToken: response.sessionToken });
      market.setPublicState(response.publicState);
      checkout.setCreated(response.order, response.payment);
    }

    reservation.jarCount = 1;
    push.success("Rezervace je uložená. QR platba je připravená v Můj med.");
    await router.push("/mujmed");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Rezervace se nepovedla.");
  } finally {
    loading.value = false;
  }
}
</script>
