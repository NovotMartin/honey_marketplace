<template>
  <section class="panel">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-black uppercase tracking-[0.25em] text-amber-700">Přehled</p>
        <h2 class="mt-2 font-display text-3xl font-black">Přehled medojedů</h2>
      </div>
      <p class="rounded-full bg-honey-100 px-4 py-2 font-black text-amber-900">{{ customers.length }} lidí</p>
    </div>

    <div class="mt-6 overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="text-xs uppercase tracking-widest text-stone-500">
          <tr>
            <th class="py-3 pr-4">Jméno</th>
            <th class="py-3 pr-4 text-right">Celkem</th>
            <th class="py-3 pr-4 text-right">Čeká</th>
            <th class="py-3 pr-4 text-right">Potvrzeno</th>
            <th class="py-3 text-right">Naposledy</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-amber-100 text-stone-800">
          <tr v-for="customer in customers" :key="customer.name">
            <td class="py-3 pr-4">
              <button v-if="selectable" class="font-black text-amber-900 underline decoration-amber-300 underline-offset-4" type="button" @click="$emit('select', customer.name)">
                {{ customer.name }}
              </button>
              <span v-else class="font-black text-amber-900">{{ customer.name }}</span>
            </td>
            <td class="py-3 pr-4 text-right font-black">{{ customer.activeJarCount }}</td>
            <td class="py-3 pr-4 text-right">{{ customer.pendingJarCount }}</td>
            <td class="py-3 pr-4 text-right">{{ customer.confirmedJarCount }}</td>
            <td class="py-3 text-right text-stone-500">{{ formatDate(customer.lastOrderAt) }}</td>
          </tr>
          <tr v-if="customers.length === 0">
            <td class="py-6 text-center text-stone-500" colspan="5">Zatím nikdo. Buď první medojed.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CustomerSummary } from "../api";
import { dateShort } from "../utils/format";

withDefaults(defineProps<{ customers: CustomerSummary[]; selectable?: boolean }>(), { selectable: true });
defineEmits<{ select: [name: string] }>();

const formatDate = dateShort;
</script>
