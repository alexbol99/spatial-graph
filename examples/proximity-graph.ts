import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
const graph = SpatialGraph.fromPoints([[0, 0], [5, 0], [5, 5], [20, 20]], {
  connect: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 8,
});
assert.equal(graph.nodeCount, 4); assert.equal(graph.edgeCount, 3);
assert.equal(graph.getConnectedComponents().length, 2);
