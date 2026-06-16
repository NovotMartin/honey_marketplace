<template>
  <Notivue v-slot="item">
    <Notification :item="item">
      <NotificationProgress :item="item" />
    </Notification>
  </Notivue>

  <main class="relative min-h-screen overflow-hidden bg-honey-50 text-stone-900">
    <div class="honeycomb-bg" aria-hidden="true"></div>
    <div class="bee bee-one" aria-hidden="true">🐝</div>
    <div class="bee bee-two" aria-hidden="true">🐝</div>
    <div class="bee bee-three" aria-hidden="true">🐝</div>

    <AppHeader />
    <RouterView />
  </main>
</template>

<script setup lang="ts">
import { Notivue, Notification, NotificationProgress } from "notivue";
import { onMounted } from "vue";
import AppHeader from "./components/AppHeader.vue";
import { useAdminStore } from "./stores/admin";
import { useMarketStore } from "./stores/market";
import { useSessionStore } from "./stores/session";

const admin = useAdminStore();
const market = useMarketStore();
const session = useSessionStore();

onMounted(async () => {
  await Promise.all([market.refresh(), session.restoreSession()]);

  if (session.isAdmin) {
    await admin.refresh(session.sessionToken).catch(() => admin.logout());
  }
});
</script>
