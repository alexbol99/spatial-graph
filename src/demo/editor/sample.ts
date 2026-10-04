import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph, type NxPoint } from '@flatten-js/spatial-graph';

/** `[from, to, width]` */
export type EdgeSpec = readonly [NxPoint, NxPoint, number];

export function graphFromEdges(specs: readonly EdgeSpec[]): SpatialGraph {
  const graph = new SpatialGraph();
  for (const [a, b, width] of specs) {
    graph.addSegment(new Segment(new Point(a[0], a[1]), new Point(b[0], b[1])), { width });
  }
  return graph;
}

/**
 * A small network that shows most of the editor: a wide spine that passes
 * straight through two junctions, a vertical run that crosses it, a loop of mixed
 * widths, a dog-leg branch and a short dead end.
 */
export function createSampleGraph(): SpatialGraph {
  return graphFromEdges([
    // Spine, width 200, one run through the junctions at x = 300, 700, 1100, 1300
    [[100, 450], [300, 450], 200],
    [[300, 450], [700, 450], 200],
    [[700, 450], [1100, 450], 200],
    [[1100, 450], [1300, 450], 200],
    [[1300, 450], [1500, 450], 200],
    // Vertical run, width 140, crossing the spine at x = 700
    [[700, 150], [700, 450], 140],
    [[700, 450], [700, 750], 140],
    // Loop back to the left, mixed widths
    [[300, 450], [300, 750], 120],
    [[300, 750], [700, 750], 120],
    // Dog-leg branch, width 100
    [[1300, 450], [1300, 200], 100],
    [[1300, 200], [1500, 200], 100],
    // Dead end, width 90
    [[1100, 450], [1100, 650], 90],
  ]);
}
