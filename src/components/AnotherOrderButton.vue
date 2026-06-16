<template>
  <button class="btn-primary" type="button" @click="$emit('another')">Chci další</button>
</template>

<script setup lang="ts">
defineEmits<{ another: [] }>();
</script>
