import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
import type { Segment2D } from '@flatten-js/spatial-graph';

const segments: Segment2D[] = [
  [
    [0, 0],
    [5, 0],
  ],
  [
    [5, 0],
    [10, 0],
  ], // Intermediate node on a square side.
  [
    [10, 0],
    [10, 10],
  ],
  [
    [10, 10],
    [0, 10],
  ],
  [
    [0, 10],
    [0, 0],
  ],
  [
    [10, 10],
    [11, 10],
  ], // Short dead end.
  [
    [100, 100],
    [110, 100],
  ], // Separate island.
];
const graph = new SpatialGraph();
graph.addEdges(segments.map((endpoints) => ({ endpoints, attributes: {} })));

// Keeping the component with most nodes is an APPLICATION policy, not a
// library definition of which component matters. Ties keep component discovery
// order; nodes within each component follow Graphology DFS, not route order.
const [, ...islands] = graph.getConnectedComponents().sort((a, b) => b.length - a.length);
assert.equal(graph.removeNodes(islands.flat()), 2);

// One pass removes the original short stubs. Repeated peeling would be a
// different policy and can erase a whole tree; choose that explicitly if wanted.
for (const stub of graph.getStubs()) {
  const neighbor = graph.getNeighbors(stub)[0];
  if (!neighbor) {
    continue;
  }
  const length = graph.getEdgeLength([stub.point, neighbor.point]);
  if (length !== null && length < 3) {
    graph.removeStubNode(stub);
  }
}
const joined = graph.joinNode([5, 0]);
assert.equal(joined.changed, true);
assert.equal(graph.nodeCount, 4);
assert.equal(graph.edgeCount, 4);
assert.equal(graph.getStubs().length, 0);
assert.equal(graph.joinNode([10, 0]).reason, 'bend'); // Safe joining preserves shape.
const cycle = graph.findPaths()[0];
assert.ok(cycle);
assert.equal(cycle.closed, true);
assert.equal(cycle.length, 40);
