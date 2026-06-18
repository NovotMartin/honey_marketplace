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

    <div v-if="isSoldOut" class="panel self-start text-center">
      <p class="section-kicker">Chci med</p>
      <h2 class="section-title">Med je vyprodaný</h2>
      <p class="mt-4 text-stone-700">
        Všechny sklenice jsou teď zamluvené. Mrkni později, jestli se nějaká objednávka neuvolní.
      </p>
      <RouterLink class="btn-secondary mt-6 inline-flex" to="/">Zpět na přehled</RouterLink>
    </div>

    <form v-else class="panel self-start" novalidate @submit.prevent="submitReservation">
      <p class="section-kicker">Chci med</p>
      <h2 class="section-title">Rezervace</h2>
      <label class="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        Web
        <input v-model="reservation.website" autocomplete="off" tabindex="-1" />
      </label>

      <label class="field-label" for="reserve-count">Počet sklenic</label>
      <input id="reserve-count" v-model.number="reservation.jarCount" class="input" type="number" min="1" :max="Math.max(market.availableJars, 1)" :aria-invalid="Boolean(visibleErrors.jarCount)" aria-describedby="reserve-count-error" />
      <p v-if="visibleErrors.jarCount" id="reserve-count-error" class="mt-2 text-sm font-bold text-red-700">{{ visibleErrors.jarCount }}</p>

      <template v-if="!session.isLoggedIn">
        <label class="field-label" for="reserve-name">Jméno v tabulce</label>
        <input id="reserve-name" v-model="reservation.name" class="input" autocomplete="name" maxlength="80" :aria-invalid="Boolean(visibleErrors.name)" aria-describedby="reserve-name-error" />
        <p v-if="visibleErrors.name" id="reserve-name-error" class="mt-2 text-sm font-bold text-red-700">{{ visibleErrors.name }}</p>

        <label class="field-label" for="reserve-password">Heslo pro pozdější úpravu</label>
        <PasswordInput id="reserve-password" v-model="reservation.password" autocomplete="new-password" :aria-invalid="Boolean(visibleErrors.password)" aria-describedby="reserve-password-error" />
        <p v-if="visibleErrors.password" id="reserve-password-error" class="mt-2 text-sm font-bold text-red-700">{{ visibleErrors.password }}</p>
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
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { createProfileOrder, createReservation } from "../api";
import PasswordInput from "../components/PasswordInput.vue";
import { useAutoRefresh } from "../composables/useAutoRefresh";
import { useCheckoutStore } from "../stores/checkout";
import { useMarketStore } from "../stores/market";
import { useSessionStore } from "../stores/session";
import { formatJarCount, money } from "../utils/format";

const router = useRouter();
const market = useMarketStore();
const session = useSessionStore();
const checkout = useCheckoutStore();
const loading = ref(false);
const submitAttempted = ref(false);
const serverPasswordError = ref("");
const reservation = reactive({ name: session.customerName, password: "", jarCount: 1, website: "", formStartedAt: Date.now() });
const amount = computed(() => (market.publicState?.settings.pricePerJarCzk ?? 0) * reservation.jarCount);
const isSoldOut = computed(() => Boolean(market.publicState) && !market.canReserve);
const validationErrors = computed(() => {
  const errors: Partial<Record<"jarCount" | "name" | "password", string>> = {};
  const jarCount = Number(reservation.jarCount);

  if (!Number.isFinite(jarCount) || jarCount < 1) {
    errors.jarCount = "Zadej počet sklenic.";
  } else if (jarCount > market.availableJars) {
    errors.jarCount = `Tolik medu už není volného. Maximum je ${formatJarCount(market.availableJars)}.`;
  }

  if (!session.isLoggedIn) {
    if (!reservation.name.trim()) {
      errors.name = "Zadej jméno do tabulky.";
    } else if (reservation.name.trim().length < 2) {
      errors.name = "Jméno musí mít alespoň 2 znaky.";
    }

    if (!reservation.password) {
      errors.password = "Zadej heslo pro pozdější úpravu.";
    }
  }

  return errors;
});
const visibleErrors = computed(() => {
  if (!submitAttempted.value) {
    return {};
  }

  return { ...validationErrors.value, ...(serverPasswordError.value ? { password: serverPasswordError.value } : {}) };
});

onMounted(() => {
  checkout.clearPayment();
  resetReservationProtection();
  void market.refresh();
});
useAutoRefresh(() => market.refresh(), 15_000);

watch(() => [reservation.name, reservation.password], () => {
  serverPasswordError.value = "";
});

function resetReservationProtection() {
  reservation.website = "";
  reservation.formStartedAt = Date.now();
}

async function submitReservation() {
  submitAttempted.value = true;
  serverPasswordError.value = "";

  if (Object.keys(validationErrors.value).length > 0) {
    return;
  }

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
    submitAttempted.value = false;
    resetReservationProtection();
    push.success("Rezervace je uložená. QR platba je připravená v Můj med.");
    await router.push("/mujmed");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rezervace se nepovedla.";

    if (message.startsWith("Toto jméno už existuje.")) {
      serverPasswordError.value = message;
      return;
    }

    push.error(message);
  } finally {
    loading.value = false;
  }
}
</script>
