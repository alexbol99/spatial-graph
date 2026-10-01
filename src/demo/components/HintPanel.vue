<script setup lang="ts">
import { ref } from 'vue';

// Folded by default so it never covers the graph; the summary says what it holds.
const open = ref(false);

const rows: Array<[string, string]> = [
  ['Drag a body', 'move the run perpendicular to itself'],
  ['Double-click a body', 'select just that edge'],
  ['Drag a vertex', 'reshape; near a vertex it merges, near an edge it connects'],
  ['Click the + on an edge', 'add a vertex and drag it'],
  ['Ctrl/Cmd + click an edge', 'add a vertex'],
  ['Ctrl/Cmd + drag', 'draw an edge from a vertex, an edge or empty space'],
  ['Right-click a vertex', 'delete it (or select it, then Delete)'],
  ['Click a body, then Delete', 'delete the run; Ctrl/Cmd + A first for all'],
  ['Esc', 'cancel the gesture'],
  ['Space + drag, wheel', 'pan, zoom'],
  ['Ctrl/Cmd + Z', 'undo (add Shift to redo)'],
];
</script>

<template>
  <details class="hint" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>Gestures</summary>
    <dl>
      <template v-for="[gesture, effect] in rows" :key="gesture">
        <dt>{{ gesture }}</dt>
        <dd>{{ effect }}</dd>
      </template>
    </dl>
    <p>Positions snap to whole units.</p>
  </details>
</template>

<style scoped>
.hint {
  position: absolute;
  top: 12px;
  left: 12px;
  max-width: min(380px, calc(100% - 24px));
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 8px 12px;
  font-size: 12.5px;
  backdrop-filter: blur(6px);
}
summary {
  cursor: pointer;
  font-weight: 600;
  user-select: none;
}
dl {
  margin: 8px 0 4px;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 3px 12px;
}
dt {
  font-weight: 600;
  white-space: nowrap;
}
dd {
  margin: 0;
  color: var(--muted);
}
p {
  margin: 6px 0 0;
  color: var(--muted);
}
@media (max-width: 520px) {
  dl {
    grid-template-columns: 1fr;
    gap: 0;
  }
  dd {
    margin-bottom: 4px;
  }
}
</style>
