<script setup lang="ts">
import type { RenderModel } from '../editor/render-model.js';

// The passive drawing of the graph. All annotation (centreline, dashes, vertex
// handles) is screen px divided by the zoom; the body is world units because it
// is the real width.
defineProps<{ model: RenderModel; scale: number }>();
</script>

<template>
  <g class="graph">
    <g class="bodies" stroke-linecap="square">
      <line
        v-for="edge in model.edges"
        :key="`b-${edge.key}`"
        :x1="edge.a[0]"
        :y1="edge.a[1]"
        :x2="edge.b[0]"
        :y2="edge.b[1]"
        :stroke-width="edge.width"
        class="body"
      />
    </g>

    <g class="centrelines" fill="none">
      <line
        v-for="edge in model.edges"
        :key="`c-${edge.key}`"
        :x1="edge.a[0]"
        :y1="edge.a[1]"
        :x2="edge.b[0]"
        :y2="edge.b[1]"
        :stroke-width="1.5 / scale"
        :stroke-dasharray="`${7 / scale} ${5 / scale}`"
        class="centre"
      />
    </g>

    <g class="vertices">
      <template v-for="node in model.nodes" :key="`v-${node.key}`">
        <!-- dead end: open ring -->
        <circle
          v-if="node.degree <= 1"
          :cx="node.at[0]"
          :cy="node.at[1]"
          :r="5 / scale"
          :stroke-width="2 / scale"
          class="stub"
        />
        <!-- pass-through: small dot -->
        <circle
          v-else-if="node.degree === 2"
          :cx="node.at[0]"
          :cy="node.at[1]"
          :r="3.5 / scale"
          class="dot"
        />
        <!-- junction: larger dot with a halo -->
        <g v-else>
          <circle
            :cx="node.at[0]"
            :cy="node.at[1]"
            :r="8 / scale"
            :stroke-width="1.5 / scale"
            class="halo"
          />
          <circle :cx="node.at[0]" :cy="node.at[1]" :r="4.5 / scale" class="dot" />
        </g>
      </template>
    </g>
  </g>
</template>

<style scoped>
.body {
  stroke: var(--body);
}
.centre {
  stroke: var(--ink);
  opacity: 0.8;
}
.stub {
  fill: var(--surface);
  stroke: var(--ink);
}
.dot {
  fill: var(--ink);
}
.halo {
  fill: var(--surface);
  stroke: var(--ink);
}
.graph {
  pointer-events: none;
}
</style>
