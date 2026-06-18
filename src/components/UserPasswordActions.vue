<template>
  <div class="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
    <PasswordInput
      :model-value="password"
      input-class="text-stone-900"
      placeholder="Nové heslo"
      autocomplete="new-password"
      :disabled="loading"
      @update:model-value="$emit('update:password', $event)"
    />
    <button class="btn-save" type="button" :disabled="loading || !password" @click="$emit('reset', customer)">Nastavit heslo</button>
    <button class="btn-secondary" type="button" :disabled="loading" @click="$emit('link', customer)">Vytvořit odkaz</button>

    <div v-if="showResetUrl && resetUrl" class="grid gap-2 lg:col-span-3 sm:grid-cols-[1fr_auto]">
      <input class="input text-stone-900" :value="resetUrl" readonly />
      <button class="btn-secondary" type="button" @click="$emit('copy', customer)">Kopírovat</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import PasswordInput from "./PasswordInput.vue";

export type UserPasswordCustomer = { id: string; name: string; createdAt: string };

withDefaults(
  defineProps<{
    customer: UserPasswordCustomer;
    password: string;
    resetUrl?: string;
    loading: boolean;
    showResetUrl?: boolean;
  }>(),
  {
    resetUrl: "",
    showResetUrl: true
  }
);

defineEmits<{
  "update:password": [value: string];
  reset: [customer: UserPasswordCustomer];
  link: [customer: UserPasswordCustomer];
  copy: [customer: UserPasswordCustomer];
}>();
</script>
