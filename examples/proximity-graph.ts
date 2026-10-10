import assert from 'node:assert/strict';
import { SpatialGraph } from '@flatten-js/spatial-graph';

// fromPoints tests every pair of canonical positions with YOUR connection rule.
// This O(n²) construction suits small point sets; it is not an indexed radius query.
const graph = SpatialGraph.fromPoints(
  [
    [0, 0],
    [5, 0],
    [5, 5],
    [20, 20],
  ],
  {
    connect: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 8,
    edgeAttributes: () => ({ label: 'nearby' }),
  },
);
assert.equal(graph.nodeCount, 4);
assert.equal(graph.edgeCount, 3);
assert.equal(graph.getConnectedComponents().length, 2);
assert.equal(graph.getNodeType([20, 20]), 'isolated');

// Connecting pairs and merging near nodes are different operations. Merging
// uses transitive clusters: endpoints of a chain can be farther than tolerance.
const clustered = new SpatialGraph();
clustered.addNode([0, 0]);
clustered.addNode([0.75, 0]);
clustered.addNode([1.5, 0]);
const report = clustered.mergeNearbyNodes(1);
assert.equal(report.clusters.length, 1);
assert.equal(report.mergedNodes, 2);
assert.equal(report.maxDisplacement, 1.5);
assert.deepEqual(clustered.getNodePoints(), [[0, 0]]);
