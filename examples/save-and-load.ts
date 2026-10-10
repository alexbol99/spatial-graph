import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';
const graph = new SpatialGraph(); graph.addEdge([[0, 0], [10, 0]], { name: 'first' }); graph.addEdge([[10, 0], [10, 10]], { name: 'second' }); graph.setNodeLabel([0, 0], 'origin');
const restored = SpatialGraph.fromJSON(JSON.parse(JSON.stringify(graph.export())));
assert.deepEqual(restored.export(), graph.export()); assert.equal(restored.getNodeLabel([0, 0]), 'origin');
assert.equal(restored.getShortestPath([0, 0], [10, 10])!.edges.length, 2);
assert.deepEqual(graph.copy().export(), graph.export());
assert.deepEqual(SpatialGraph.fromGraphology(graph.toGraphology()).export(), graph.export());
