import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Quantization defines identity; it does not make every projected split possible.
const graph = new SpatialGraph({ coordinatePrecision: 0 });
const first = graph.addEdge(
  [
    [0.1, 0.1],
    [3.1, 1.1],
  ],
  { label: 'original' },
);
const duplicate = graph.addEdge(
  [
    [3, 1],
    [0, 0],
  ],
  { label: 'ignored' },
);
const collapsed = graph.addEdge([
  [8.1, 8.1],
  [8.2, 8.2],
]);

assert.equal(first.status, 'added');
assert.equal(duplicate.status, 'existing');
assert.equal(
  graph.getEdgeLabel([
    [0, 0],
    [3, 1],
  ]),
  'original',
);
assert.equal(collapsed.status, 'collapsed');
assert.equal(collapsed.edge, null);
assert.equal(graph.hasNode([8, 8]), false); // Collapses create no endpoints.
assert.equal(graph.getNodeKey([0.1, -0]), '0,0');

const nearest = graph.findNearestEdge([1, 1]);
assert.ok(nearest);
assert.ok(Math.abs(nearest.point[0] - 1.2) < 1e-12);
assert.ok(Math.abs(nearest.point[1] - 0.4) < 1e-12);
const before = graph.export();
// [1.2, 0.4] is on the edge, but its integer-grid position [1, 0] is off it.
assert.throws(() => graph.splitEdge(nearest.edge, nearest.point), /quantization/);
assert.deepEqual(graph.export(), before);

// The same projection can be inserted with the default exact coordinate policy.
const exact = new SpatialGraph();
exact.addEdge([
  [0, 0],
  [3, 1],
]);
const exactNearest = exact.findNearestEdge([1, 1]);
assert.ok(exactNearest);
assert.equal(exact.splitEdge(exactNearest.edge, exactNearest.point).changed, true);

// Grid intersections that cannot be represented are reported, not rounded off-edge.
const crossing = new SpatialGraph({ coordinatePrecision: 0 });
crossing.addEdge([
  [0, 0],
  [1, 1],
]);
crossing.addEdge([
  [0, 1],
  [1, 0],
]);
const report = crossing.planarize();
assert.equal(report.changed, false);
assert.deepEqual(report.unresolved, [[0.5, 0.5]]);
assert.equal(crossing.edgeCount, 2);
