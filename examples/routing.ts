// Route along a network and measure the result.
//
// Two ways to get from the west end to the east end: straight through the middle
// (short) or around a far-away detour (long). Shortest path is weighted by edge
// length, not by the number of segments.
import assert from 'node:assert/strict';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';

const line = (x1: number, y1: number, x2: number, y2: number) =>
  new Segment(new Point(x1, y1), new Point(x2, y2));

const graph = new SpatialGraph({
  segments: [
    line(0, 0, 10, 0),
    line(10, 0, 20, 0), // direct route: 2 segments, length 20
    line(0, 0, 0, 30),
    line(0, 30, 20, 30),
    line(20, 30, 20, 0), // detour: 3 segments, length 80
  ],
});

// Start from an arbitrary location by snapping to the closest node.
const start = graph.getClosestNodeToPoint([1, 2]);
const route = graph.getShortestPath(start, [20, 0]); // Segment[], [] when unreachable

const length = route.reduce((sum, segment) => sum + segment.length, 0);
console.log(`start ${start}, ${route.length} segments, length ${length}`);

assert.deepEqual(start, [0, 0]);
assert.equal(route.length, 2);
assert.equal(length, 20);
