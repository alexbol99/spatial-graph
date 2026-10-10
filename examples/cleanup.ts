import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
import type { Segment2D } from '@flatten-js/spatial-graph';
const segments: Segment2D[] = [[[0, 0], [5, 0]], [[5, 0], [10, 0]], [[10, 0], [10, 10]], [[10, 10], [0, 10]], [[0, 10], [0, 0]], [[10, 10], [11, 10]], [[100, 100], [110, 100]]];
const graph = new SpatialGraph(); graph.addEdges(segments.map((endpoints) => ({ endpoints, attributes: {} })));
const [, ...islands] = graph.getConnectedComponents().sort((a, b) => b.length - a.length);
graph.removeNodes(islands.flat());
for (const stub of graph.getStubs()) {
  const neighbor = graph.getNeighbors(stub)[0];
  if (neighbor && graph.getEdgeLength([stub.point, neighbor.point])! < 3) graph.removeStubNode(stub);
}
graph.joinNode([5, 0]);
assert.equal(graph.nodeCount, 4); assert.equal(graph.edgeCount, 4); assert.equal(graph.getStubs().length, 0);
