// Snap an off-network point onto the closest edge and connect it.
//
// projectPointOnClosestEdge gives the foot of the perpendicular and the edge it
// lies on. splitEdge makes the foot a real node, then a new segment links the
// original point to it.
import assert from 'node:assert/strict';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';

const graph = new SpatialGraph({
  segments: [new Segment(new Point(0, 0), new Point(20, 0))],
});

const site = [4, 3] as const;
const [snapped, edge] = graph.projectPointOnClosestEdge(site);
graph.splitEdge(edge, snapped);
graph.addSegment(new Segment(new Point(...site), new Point(...snapped)));

const route = graph.getShortestPath(site, [20, 0]);
console.log(`snapped to ${snapped}, route has ${route.length} segments`);

assert.deepEqual(snapped, [4, 0]);
assert.equal(graph.size, 3);
assert.deepEqual(graph.getJunctions(), [[4, 0]]);
assert.equal(route.length, 2);
