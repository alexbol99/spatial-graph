<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { EditorController, type View } from './editor/controller.js';
import { createSampleGraph } from './editor/sample.js';
import ConfirmDialog from './components/ConfirmDialog.vue';
import GraphEditor from './components/GraphEditor.vue';
import HintPanel from './components/HintPanel.vue';

const controller = new EditorController(createSampleGraph());
// Handy in the browser console while developing: `__editor.graph.getEdges()`.
if (import.meta.env.DEV) (window as unknown as { __editor: EditorController }).__editor = controller;
const view = shallowRef<View>(controller.view);
const unsubscribe = controller.subscribe((next) => {
  view.value = next;
});
onBeforeUnmount(unsubscribe);

const editor = ref<InstanceType<typeof GraphEditor> | null>(null);

const toast = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => view.value.message?.id,
  () => {
    toast.value = view.value.message?.text ?? null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = null), 5000);
  },
);

const stats = computed(() => {
  const { nodes, edges, runs } = view.value.stats;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    count(nodes, 'vertex', 'vertices'),
    count(edges, 'edge', 'edges'),
    count(runs, 'run', 'runs'),
  ].join(' · ');
});
</script>

<template>
  <div class="app">
    <header>
      <div class="title">
        <h1>Spatial graph editor</h1>
        <p>
          A demo of <code>@flatten-js/spatial-graph</code>: nodes are points, edges are segments.
        </p>
      </div>
      <div class="actions">
        <button type="button" :disabled="!view.canUndo" @click="controller.undo()">Undo</button>
        <button type="button" :disabled="!view.canRedo" @click="controller.redo()">Redo</button>
        <button type="button" @click="controller.reset()">Reset</button>
        <button type="button" @click="editor?.fit()">Fit view</button>
      </div>
    </header>

    <main>
      <GraphEditor ref="editor" :controller="controller" />
      <HintPanel />
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
      <ConfirmDialog
        :open="view.confirm === 'deleteAll'"
        title="Delete all edges?"
        message="Every edge and vertex is removed. You can undo this."
        confirm-label="Delete all"
        @confirm="controller.confirmDeleteAll()"
        @cancel="controller.cancelConfirm()"
      />
    </main>

    <footer>{{ stats }}</footer>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100%;
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.title p {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 6px;
}
button {
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: var(--hover);
}
button:focus-visible {
  outline: 2px solid var(--hover);
  outline-offset: 2px;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
main {
  position: relative;
  min-height: 0;
  overflow: hidden;
}
footer {
  padding: 6px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.toast {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  max-width: min(520px, calc(100% - 32px));
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow);
  font-size: 13px;
}
</style>
