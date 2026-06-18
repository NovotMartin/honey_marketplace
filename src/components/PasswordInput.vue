<template>
  <div class="relative">
    <input
      :id="id"
      ref="inputEl"
      class="input w-full pr-12"
      :class="inputClass"
      :type="visible ? 'text' : 'password'"
      :value="modelValue"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :minlength="minlength"
      :required="required"
      :disabled="disabled"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      class="absolute right-3 top-1/2 inline-flex -translate-y-1/2 rounded-full p-1 text-stone-500 transition hover:bg-honey-100 hover:text-honey-800 focus:outline-none focus:ring-2 focus:ring-honey-400"
      type="button"
      :aria-label="visible ? 'Skrýt heslo' : 'Zobrazit heslo'"
      :title="visible ? 'Skrýt heslo' : 'Zobrazit heslo'"
      :disabled="disabled"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" class="h-5 w-5" aria-hidden="true" />
      <Eye v-else class="h-5 w-5" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "lucide-vue-next";
import { ref } from "vue";

withDefaults(
  defineProps<{
    modelValue: string;
    id?: string;
    placeholder?: string;
    autocomplete?: string;
    minlength?: number | string;
    required?: boolean;
    disabled?: boolean;
    inputClass?: string;
  }>(),
  {
    id: undefined,
    placeholder: undefined,
    autocomplete: undefined,
    minlength: undefined,
    required: false,
    disabled: false,
    inputClass: ""
  }
);

defineEmits<{ "update:modelValue": [value: string] }>();

const visible = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

defineExpose({
  focus: () => inputEl.value?.focus()
});
</script>
