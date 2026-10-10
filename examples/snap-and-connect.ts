import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// Split first to make the projection a connected graph node, then add the spur.
const graph = new SpatialGraph();
graph.addEdge([
  [0, 0],
  [20, 0],
]);
const site = [4, 3] as const;
const nearest = graph.findNearestEdge(site);
if (nearest) {
  graph.splitEdge(nearest.edge, nearest.point);
  graph.addEdge([site, nearest.point]);
}

assert.ok(nearest);
assert.deepEqual(nearest.point, [4, 0]);
assert.equal(nearest.distance, 3);
assert.equal(graph.edgeCount, 3);
assert.deepEqual(
  graph.getJunctions().map((node) => node.point),
  [[4, 0]],
);
assert.equal(graph.getShortestPath(site, [20, 0])?.edges.length, 2);
assert.equal(graph.getEdge(nearest.edge), null); // The original segment was replaced.

// Endpoint projections do not require a split. Empty networks return null.
const endpoint = graph.findNearestEdge([22, 0]);
assert.ok(endpoint);
assert.deepEqual(endpoint.point, [20, 0]);
assert.equal(graph.splitEdge(endpoint.edge, endpoint.point).reason, 'endpoint');
assert.equal(new SpatialGraph().findNearestEdge(site), null);
// On a quantized graph the projection may round off the segment and throw;
// precision.ts demonstrates that case and the exact-coordinate alternative.
