// Turn crossing segments into a proper network by splitting them at every
// crossing, so that routes can switch lines where the lines meet.
import assert from 'node:assert/strict';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '@flatten-js/spatial-graph';
import type { NxEdge, NxPoint } from '@flatten-js/spatial-graph';

const line = (x1: number, y1: number, x2: number, y2: number) =>
  new Segment(new Point(x1, y1), new Point(x2, y2));

const toSegment = ([start, end]: NxEdge) =>
  new Segment(new Point(...start), new Point(...end));

const findCrossing = (first: NxEdge, second: NxEdge): NxPoint | null => {
  const intersections = toSegment(first).intersect(toSegment(second));
  if (intersections.length !== 1) return null;

  const [intersection] = intersections;
  return intersection instanceof Point ? [intersection.x, intersection.y] : null;
};

const graph = new SpatialGraph({
  segments: [line(0, 0, 10, 10), line(0, 10, 10, 0), line(0, 2, 10, 2)],
});

const edges = graph.getEdges();

// Collect the crossings on each original edge first, then split.
const crossings = new Map<NxEdge, NxPoint[]>(edges.map((edge) => [edge, []]));
for (const [i, a] of edges.entries()) {
  for (const b of edges.slice(i + 1)) {
    const point = findCrossing(a, b); // null when they do not cross
    if (point) {
      crossings.get(a)!.push(point);
      crossings.get(b)!.push(point);
    }
  }
}

for (const [edge, points] of crossings) {
  // Split from one end to the other so each split acts on the remaining piece.
  points.sort(
    (p, q) =>
      Math.hypot(edge[0][0] - p[0], edge[0][1] - p[1]) -
      Math.hypot(edge[0][0] - q[0], edge[0][1] - q[1]),
  );
  let rest: NxEdge = edge;
  for (const point of points) {
    graph.splitEdge(rest, point);
    rest = [point, edge[1]];
  }
}

console.log(`junctions: ${JSON.stringify(graph.getJunctions())}, edges: ${graph.size}`);

assert.equal(graph.size, 9); // each of the 3 lines is now 3 pieces
assert.equal(graph.getJunctions().length, 3);
assert.equal(graph.getShortestPath([0, 0], [0, 2]).length, 2); // switch lines at [2, 2]
assert.equal(graph.getShortestPath([2, 2], [8, 2]).length, 1); // the middle piece of line 3
