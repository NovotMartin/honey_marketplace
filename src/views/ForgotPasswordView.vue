<template>
  <section class="relative z-10 mx-auto max-w-3xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div class="panel">
      <p class="section-kicker">Zapomenuté přihlášení</p>
      <h1 class="section-title">Požádat o reset hesla</h1>

      <div v-if="done" class="mt-6 rounded-3xl bg-emerald-100 p-5 font-bold text-emerald-900">
        Žádost byla předaná adminovi. Jakmile ji vyřeší, dostaneš nový odkaz nebo heslo osobně.
      </div>

      <form v-else class="mt-6 grid gap-4" @submit.prevent="submitRequest">
        <label class="field-label" for="forgot-customer">Vyber svůj účet</label>
        <select id="forgot-customer" v-model="customerId" class="input" :disabled="loading">
          <option value="">Vyber jméno</option>
          <option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }}</option>
        </select>
        <button class="btn-primary" type="submit" :disabled="loading || !customerId">
          {{ loading ? "Odesílám..." : "Požádat o reset hesla" }}
        </button>
      </form>

      <RouterLink class="btn-secondary mt-5 inline-flex" to="/mujmed">Zpět na Můj med</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { onMounted, ref } from "vue";
import { createPasswordResetRequest, getPasswordResetRequestCustomers } from "../api";
import { useSessionStore } from "../stores/session";

const session = useSessionStore();
const customers = ref<Array<{ id: string; name: string }>>([]);
const customerId = ref("");
const loading = ref(false);
const done = ref(false);

async function loadCustomers() {
  customers.value = (await getPasswordResetRequestCustomers()).customers;
  customerId.value = customers.value.find((customer) => customer.name === session.lastCustomerName)?.id ?? "";
}

async function submitRequest() {
  if (!customerId.value) {
    return;
  }

  loading.value = true;

  try {
    const response = await createPasswordResetRequest(customerId.value);
    done.value = true;
    push.success(response.message);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Žádost se nepodařilo odeslat.");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadCustomers().catch((error) => push.error(error instanceof Error ? error.message : "Uživatele se nepodařilo načíst."));
});
</script>
