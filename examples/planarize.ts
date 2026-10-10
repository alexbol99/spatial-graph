import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Geometric crossings alone do not create adjacency. Planarize splits ALL cuts.
const graph = new SpatialGraph();
graph.addEdges([
  {
    endpoints: [
      [0, 0],
      [10, 10],
    ],
    attributes: {},
  },
  {
    endpoints: [
      [0, 10],
      [10, 0],
    ],
    attributes: {},
  },
  {
    endpoints: [
      [0, 2],
      [10, 2],
    ],
    attributes: {},
  },
]);
const disconnected = graph.getShortestPath([0, 0], [0, 2]); // null
const report = graph.planarize();

assert.equal(disconnected, null);
assert.equal(report.changed, true);
assert.deepEqual(report.unresolved, []);
assert.equal(graph.edgeCount, 9);
assert.equal(graph.getJunctions().length, 3);
assert.equal(graph.getShortestPath([0, 0], [0, 2])?.edges.length, 2);
const revision = graph.revision;
assert.equal(graph.planarize().changed, false); // Repeating is a no-op.
assert.equal(graph.revision, revision);

// Graph paths contain snapshot nodes and edges, not bare coordinate arrays.
const paths = graph.findPaths();
assert.equal(
  paths.reduce((count, path) => count + path.edges.length, 0),
  graph.edgeCount,
);
// See precision.ts for unresolved grid intersections and cleanup.ts for safe joins.
