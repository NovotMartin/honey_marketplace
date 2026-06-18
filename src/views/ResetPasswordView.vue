<template>
  <section class="relative z-10 mx-auto max-w-3xl px-4 py-6 pb-14 sm:px-6 lg:px-8 lg:py-10">
    <div v-if="loading" class="panel text-center">
      <p class="section-kicker">Reset hesla</p>
      <h1 class="section-title">Načítám odkaz...</h1>
    </div>

    <div v-else-if="error" class="panel text-center">
      <p class="section-kicker">Reset hesla</p>
      <h1 class="section-title">Odkaz není platný</h1>
      <p class="mt-3 text-stone-600">{{ error }}</p>
      <RouterLink class="btn-secondary mt-5 inline-flex" to="/">Zpět na med</RouterLink>
    </div>

    <div v-else-if="done" class="panel text-center">
      <p class="section-kicker">Reset hesla</p>
      <h1 class="section-title">Heslo je změněné</h1>
      <p class="mt-3 text-stone-600">Teď se můžeš přihlásit novým heslem.</p>
      <RouterLink class="btn-primary mt-5 inline-flex" to="/mujmed">Přejít na Můj med</RouterLink>
    </div>

    <form v-else-if="resetInfo" class="panel" @submit.prevent="submitReset">
      <p class="section-kicker">Reset hesla</p>
      <h1 class="section-title">Nové heslo pro {{ resetInfo.customer.name }}</h1>
      <p class="mt-3 text-stone-600">Odkaz platí do {{ formatDateTime(resetInfo.expiresAt) }}. Spotřebuje se až po nastavení hesla.</p>

      <label class="field-label" for="password">Nové heslo</label>
      <PasswordInput id="password" v-model="form.password" autocomplete="new-password" required />

      <label class="field-label" for="password-confirm">Ještě jednou</label>
      <PasswordInput id="password-confirm" v-model="form.passwordConfirm" autocomplete="new-password" required />

      <p v-if="form.passwordConfirm" class="mt-3 rounded-2xl p-3 text-sm font-black" :class="passwordsMatch ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'">
        {{ passwordsMatch ? "Hesla se shodují." : "Hesla se neshodují." }}
      </p>

      <button class="btn-save mt-5 w-full" type="submit" :disabled="submitting || !canSubmit">{{ submitting ? "Ukládám..." : "Nastavit nové heslo" }}</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { getPasswordReset, submitPasswordReset, type PasswordResetInfo } from "../api";
import PasswordInput from "../components/PasswordInput.vue";

const route = useRoute();
const resetInfo = ref<PasswordResetInfo | null>(null);
const loading = ref(true);
const submitting = ref(false);
const done = ref(false);
const error = ref("");
const form = reactive({ password: "", passwordConfirm: "" });
const passwordsMatch = computed(() => form.password.length > 0 && form.password === form.passwordConfirm);
const canSubmit = computed(() => form.password.length > 0 && form.passwordConfirm.length > 0 && passwordsMatch.value);

function tokenParam() {
  const token = route.params.token;
  return Array.isArray(token) ? token[0] ?? "" : token ?? "";
}

function linkIdParam() {
  const linkId = route.params.linkId;
  return Array.isArray(linkId) ? linkId[0] ?? "" : linkId ?? "";
}

async function loadReset() {
  loading.value = true;
  error.value = "";

  try {
    resetInfo.value = await getPasswordReset(linkIdParam(), tokenParam());
  } catch (loadError) {
    resetInfo.value = null;
    error.value = loadError instanceof Error ? loadError.message : "Odkaz není platný nebo už vypršel.";
  } finally {
    loading.value = false;
  }
}

async function submitReset() {
  if (!canSubmit.value) {
    push.error("Hesla se neshodují.");
    return;
  }

  submitting.value = true;

  try {
    await submitPasswordReset(linkIdParam(), tokenParam(), form.password);
    done.value = true;
    resetInfo.value = null;
    form.password = "";
    form.passwordConfirm = "";
    push.success("Heslo je změněné.");
  } catch (submitError) {
    error.value = submitError instanceof Error ? submitError.message : "Odkaz není platný nebo už vypršel.";
    resetInfo.value = null;
  } finally {
    submitting.value = false;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

onMounted(() => void loadReset());
</script>
