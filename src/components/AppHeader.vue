<template>
  <header class="relative z-10 mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
    <nav class="rounded-[1.75rem] border-4 border-white/70 bg-white/80 p-3 shadow-honey backdrop-blur md:flex md:items-center md:justify-between">
      <RouterLink class="flex w-full items-center justify-center rounded-2xl bg-honey-100 px-4 py-3 text-center font-display text-2xl font-black leading-tight text-stone-950 md:w-auto" to="/">
        Domácí med
      </RouterLink>
      <div class="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:flex-wrap md:justify-end">
        <RouterLink
          v-for="item in items"
          :key="item.path"
          class="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-stone-700 transition hover:-translate-y-0.5 hover:bg-honey-100 sm:text-base"
          active-class="!bg-stone-950 !text-white shadow-lg"
          :to="item.path"
          :aria-label="item.title"
          :title="item.title"
        >
          {{ item.label }}
        </RouterLink>
      </div>

      <div v-if="session.isLoggedIn" class="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900 md:justify-end">
        <span>Přihlášen: {{ session.customerName }}</span>
        <button class="rounded-full bg-white px-3 py-1 font-black text-emerald-800 transition hover:bg-emerald-100" type="button" @click="logoutCustomer">
          Odhlásit
        </button>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { push } from "notivue";
import { computed } from "vue";
import { useAdminStore } from "../stores/admin";
import { useCheckoutStore } from "../stores/checkout";
import { useSessionStore } from "../stores/session";

const admin = useAdminStore();
const checkout = useCheckoutStore();
const session = useSessionStore();
const items = computed(() => [
  { path: "/", label: "Domů", title: "Domů" },
  { path: "/chcimed", label: "Chci med", title: "Chci med" },
  { path: "/mujmed", label: "Můj med", title: "Můj med" },
  ...(session.isAdmin ? [{ path: "/admin", label: "⚙️", title: "Admin" }, { path: "/objednavky", label: "Objednávky", title: "Objednávky" }] : [])
]);

async function logoutCustomer() {
  await session.logout();
  admin.logout();
  checkout.clearPayment();
  push.success("Profil je odhlášený.");
}
</script>
