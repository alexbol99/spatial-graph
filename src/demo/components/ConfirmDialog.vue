<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const cancelButton = ref<HTMLButtonElement | null>(null);

// Cancel is the focused default, so a stray Enter never deletes anything.
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    cancelButton.value?.focus();
  },
);
</script>

<template>
  <div v-if="open" class="scrim" @pointerdown.self="emit('cancel')">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{{ title }}</h2>
      <p>{{ message }}</p>
      <div class="actions">
        <button ref="cancelButton" type="button" @click="emit('cancel')">Cancel</button>
        <button type="button" class="danger" @click="emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(10 14 22 / 0.35);
  z-index: 10;
}
.dialog {
  width: min(360px, calc(100% - 32px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  padding: 18px 20px;
}
h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
p {
  margin: 0 0 16px;
  color: var(--muted);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
button {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--hover);
  outline-offset: 2px;
}
.danger {
  background: var(--collapse);
  border-color: var(--collapse);
  color: #fff;
}
</style>
