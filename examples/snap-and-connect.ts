import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
const graph = new SpatialGraph(); graph.addEdge([[0, 0], [20, 0]]);
const site = [4, 3] as const;
const nearest = graph.findNearestEdge(site)!;
graph.splitEdge(nearest.edge, nearest.point); graph.addEdge([site, nearest.point]);
assert.deepEqual(nearest.point, [4, 0]); assert.equal(graph.edgeCount, 3);
assert.deepEqual(graph.getJunctions().map((node) => node.point), [[4, 0]]);
assert.equal(graph.getShortestPath(site, [20, 0])!.edges.length, 2);
