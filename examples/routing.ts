import assert from 'node:assert/strict';
import { PathAlgorithm, SpatialGraph } from '@flatten-js/spatial-graph';

// Two alternatives: a short direct edge and a longer, cheaper detour.
const graph = new SpatialGraph();
graph.addEdges([
  {
    endpoints: [
      [0, 0],
      [20, 0],
    ],
    attributes: { fare: 10 },
  },
  {
    endpoints: [
      [0, 0],
      [0, 10],
    ],
    attributes: { fare: 1 },
  },
  {
    endpoints: [
      [0, 10],
      [20, 10],
    ],
    attributes: { fare: 1 },
  },
  {
    endpoints: [
      [20, 10],
      [20, 0],
    ],
    attributes: { fare: 1 },
  },
]);
const path = graph.getShortestPath([0, 0], [20, 0], { algorithm: PathAlgorithm.AStar });
const length = path?.length; // 20; missing/disconnected endpoints yield null.

assert.ok(path);
assert.equal(length, 20);
assert.equal(path.cost, 20);
assert.equal(path.edges.length, 1);

// A custom cost is independent of geometry. A* defaults to a zero heuristic
// for custom costs: a Euclidean heuristic would overestimate this cheap detour.
const cheapest = graph.getShortestPath([0, 0], [20, 0], {
  algorithm: PathAlgorithm.AStar,
  cost: (edge) => Number(edge.attributes.fare),
});
assert.ok(cheapest);
assert.equal(cheapest.cost, 3);
assert.equal(cheapest.length, 40);
assert.equal(cheapest.edges.length, 3);
const detour = graph.getShortestPath([0, 0], [20, 0], {
  cost: (edge) => (edge.attributes.fare === 10 ? null : edge.length),
});
assert.equal(detour?.length, 40); // null closes an edge.
assert.equal(graph.getShortestPath([0, 0], [99, 99]), null);

// A virtual route runs BETWEEN projections; it excludes access distances.
const revision = graph.revision;
const virtual = graph.route([2, -1], [18, -1], { maxSnapDistance: 2 });
assert.ok(virtual);
assert.deepEqual(virtual.points, [
  [2, 0],
  [18, 0],
]);
assert.equal(virtual.length, 16);
assert.equal(virtual.from.distance, 1);
assert.equal(graph.revision, revision);
assert.equal(graph.hasNode([2, 0]), false);
assert.equal(graph.route([2, -5], [18, -5], { maxSnapDistance: 2 }), null);
