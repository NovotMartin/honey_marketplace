<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input v-model="filter" class="input max-w-md text-stone-900" type="search" :placeholder="filterPlaceholder" />
      <div class="flex flex-wrap items-center justify-end gap-2">
        <p class="text-sm font-bold text-stone-600">
          Zobrazeno {{ visibleRows.length }} z {{ rows.length }}
        </p>
        <button v-if="showRefresh" class="btn-secondary px-3 py-1.5 text-xs" type="button" :disabled="refreshing" @click="emit('refresh')">
          {{ refreshing ? "Obnovuji..." : refreshLabel }}
        </button>
      </div>
    </div>

    <div class="space-y-3 lg:hidden">
      <div v-if="visibleRows.length === 0" class="rounded-3xl bg-white/75 p-5 text-stone-500 ring-1 ring-honey-100">{{ emptyText }}</div>
      <article v-for="row in visibleRows" :key="keyFor(row)" class="rounded-3xl bg-white/75 p-4 text-sm text-stone-800 ring-1 ring-honey-100">
        <slot v-if="$slots['mobile-row']" name="mobile-row" :row="row" />
        <template v-else>
          <div class="grid grid-cols-2 gap-x-4 gap-y-3">
            <template v-for="column in columns" :key="column.key">
              <div v-if="column.key !== 'actions'" :class="column.align === 'right' ? 'text-right' : 'text-left'">
                <p class="text-xs font-black uppercase tracking-wide text-stone-500">{{ column.label }}</p>
                <div class="mt-1" :class="column.cellClass">
                  <slot :name="`cell-${column.key}`" :row="row" :column="column" display="mobile">
                    {{ column.getFilterValue?.(row) ?? "" }}
                  </slot>
                </div>
              </div>
            </template>
          </div>
          <div v-if="columns.some((column) => column.key === 'actions')" class="mt-4 border-t border-honey-100 pt-3">
            <slot name="cell-actions" :row="row" :column="columns.find((column) => column.key === 'actions')" display="mobile" />
          </div>
        </template>
      </article>
    </div>

    <div class="hidden overflow-x-auto rounded-3xl bg-white/75 p-4 ring-1 ring-honey-100 lg:block">
      <table class="w-full min-w-[1080px] text-left text-sm">
        <thead class="text-stone-500">
          <tr>
            <th v-for="column in columns" :key="column.key" class="py-3 pr-3" :class="[column.headerClass, column.align === 'right' ? 'text-right' : 'text-left']">
              <button
                v-if="column.sortable"
                class="inline-flex items-center gap-2 font-black transition hover:text-honey-700"
                :class="column.align === 'right' ? 'justify-end' : 'justify-start'"
                type="button"
                @click="toggleSort(column)"
              >
                <span>{{ column.label }}</span>
                <span class="text-xs">{{ sortKey === column.key ? (sortDirection === "asc" ? "▲" : "▼") : "↕" }}</span>
              </button>
              <span v-else>{{ column.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="visibleRows.length === 0" class="border-t border-honey-100">
            <td class="py-5 text-stone-500" :colspan="columns.length">{{ emptyText }}</td>
          </tr>
          <tr v-for="row in visibleRows" :key="keyFor(row)" class="border-t border-honey-100 text-stone-800">
            <td v-for="column in columns" :key="column.key" class="py-3 pr-3 align-middle" :class="[column.cellClass, column.align === 'right' ? 'text-right' : 'text-left']">
              <slot :name="`cell-${column.key}`" :row="row" :column="column" display="desktop">
                {{ column.getFilterValue?.(row) ?? "" }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

export type DataTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
  headerClass?: string;
  cellClass?: string;
  getSortValue?: (row: unknown) => Date | number | string | null | undefined;
  getFilterValue?: (row: unknown) => number | string | null | undefined;
};

const props = withDefaults(
  defineProps<{
    rows: unknown[];
    columns: DataTableColumn[];
    rowKey: string | ((row: unknown) => string);
    emptyText?: string;
    filterPlaceholder?: string;
    showRefresh?: boolean;
    refreshing?: boolean;
    refreshLabel?: string;
    defaultSortKey?: string;
    defaultSortDirection?: "asc" | "desc";
  }>(),
  {
    emptyText: "Žádná data.",
    filterPlaceholder: "Filtrovat...",
    showRefresh: false,
    refreshing: false,
    refreshLabel: "Obnovit",
    defaultSortKey: "",
    defaultSortDirection: "asc"
  }
);

const emit = defineEmits<{
  refresh: [];
}>();

const filter = ref("");
const sortKey = ref(props.defaultSortKey || props.columns.find((column) => column.sortable)?.key || "");
const sortDirection = ref<"asc" | "desc">(props.defaultSortDirection);

const activeSortColumn = computed(() => props.columns.find((column) => column.key === sortKey.value));

const filteredRows = computed(() => {
  const needle = filter.value.trim().toLocaleLowerCase("cs-CZ");

  if (!needle) {
    return props.rows;
  }

  return props.rows.filter((row) =>
    props.columns.some((column) => String(column.getFilterValue?.(row) ?? "").toLocaleLowerCase("cs-CZ").includes(needle))
  );
});

const visibleRows = computed(() => {
  const column = activeSortColumn.value;

  if (!column?.sortable) {
    return filteredRows.value;
  }

  return [...filteredRows.value].sort((a, b) => compareValues(column.getSortValue?.(a), column.getSortValue?.(b)));
});

function compareValues(left: Date | number | string | null | undefined, right: Date | number | string | null | undefined) {
  const direction = sortDirection.value === "asc" ? 1 : -1;
  const leftValue = normalizeSortValue(left);
  const rightValue = normalizeSortValue(right);

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return (leftValue - rightValue) * direction;
  }

  return String(leftValue).localeCompare(String(rightValue), "cs-CZ", { numeric: true, sensitivity: "base" }) * direction;
}

function normalizeSortValue(value: Date | number | string | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }

  return value ?? "";
}

function toggleSort(column: DataTableColumn) {
  if (!column.sortable) {
    return;
  }

  if (sortKey.value === column.key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }

  sortKey.value = column.key;
  sortDirection.value = "asc";
}

function keyFor(row: unknown) {
  if (typeof props.rowKey === "function") {
    return props.rowKey(row);
  }

  return String((row as Record<string, unknown>)[props.rowKey]);
}
</script>
