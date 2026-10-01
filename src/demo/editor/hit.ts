import { nearestPointOnSegment, type NxPoint, type NxEdge, type SpatialGraph } from '@flatten-js/spatial-graph';
import {
  BODY_MIN_HIT_PX,
  GHOST_MIN_SPAN_PX,
  GHOST_RADIUS_PX,
  VERTEX_RADIUS_PX,
} from './constants.js';
import type { Ghost, Hit } from './types.js';
import { dist, edgeLength, midpoint, widthOf } from './util.js';

/**
 * Where an edge's insertion ghost sits: its midpoint. An edge too short on screen
 * to keep the ghost clear of its two vertex handles gets none.
 */
export function ghostPosition(edge: NxEdge, scale: number): NxPoint | null {
  return edgeLength(edge) * scale >= GHOST_MIN_SPAN_PX ? midpoint(edge[0], edge[1]) : null;
}

/** The nearest ghost within `radiusPx` of `world`, if any. */
export function findGhost(
  graph: SpatialGraph,
  world: NxPoint,
  scale: number,
  radiusPx: number,
): Ghost | null {
  let best: Ghost | null = null;
  let bestDistance = radiusPx / scale;
  for (const edge of graph.getEdges()) {
    const at = ghostPosition(edge, scale);
    if (!at) continue;
    const d = dist(world, at);
    if (d <= bestDistance) {
      bestDistance = d;
      best = { edge, at };
    }
  }
  return best;
}

/** Radius of a vertex handle: screen-stable, but never wider than the narrowest edge at it. */
export function vertexRadius(graph: SpatialGraph, node: NxPoint, scale: number): number {
  let radius = VERTEX_RADIUS_PX / scale;
  for (const neighbor of graph.getPointNeighbors(node)) {
    radius = Math.min(radius, widthOf(graph, [node, neighbor]) / 2);
  }
  return radius;
}

export type HitOptions = {
  /** Skip insertion ghosts (default: test them). */
  ghosts?: boolean;
};

/**
 * What is under `world`. First match wins: vertex, insertion ghost, edge body,
 * empty space. All screen sizes are divided by `scale`.
 */
export function hitTest(
  graph: SpatialGraph,
  world: NxPoint,
  scale: number,
  options: HitOptions = {},
): Hit {
  let vertex: NxPoint | null = null;
  let vertexDistance = Infinity;
  for (const node of graph.getNodes()) {
    const d = dist(world, node);
    if (d <= vertexRadius(graph, node, scale) && d < vertexDistance) {
      vertexDistance = d;
      vertex = node;
    }
  }
  if (vertex) return { kind: 'vertex', at: vertex };

  if (options.ghosts !== false) {
    const ghost = findGhost(graph, world, scale, GHOST_RADIUS_PX);
    if (ghost) return { kind: 'ghost', ...ghost };
  }

  let body: Hit | null = null;
  let bodyDistance = Infinity;
  for (const edge of graph.getEdges()) {
    const near = nearestPointOnSegment(world, edge);
    const reach = Math.max(widthOf(graph, edge) / 2, BODY_MIN_HIT_PX / scale);
    if (near.distance <= reach && near.distance < bodyDistance) {
      bodyDistance = near.distance;
      body = { kind: 'body', edge, at: near.point };
    }
  }
  return body ?? { kind: 'empty' };
}
