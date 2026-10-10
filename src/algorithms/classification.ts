import type { AbstractGraph } from 'graphology-types';
import type { NodeType } from '../types.js';
import type { StoredEdge, StoredNode } from '../internal/storage.js';

/** Derive a node's classification from canonical stored coordinates. */
export function classifyNode<N extends object, E extends object>(
  graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>,
  key: string,
  straightAngleToleranceDeg: number,
): NodeType {
  const degree = graph.degree(key);
  if (degree === 0) return 'isolated';
  if (degree === 1) return 'stub';
  if (degree > 2) return 'junction';
  const center = graph.getNodeAttributes(key);
  const [aKey, bKey] = graph.neighbors(key);
  if (aKey === undefined || bKey === undefined) {
    throw new Error('Graph storage is inconsistent: a degree-2 node has fewer than two neighbors.');
  }
  const a = graph.getNodeAttributes(aKey);
  const b = graph.getNodeAttributes(bKey);
  const ax = a.x - center.x;
  const ay = a.y - center.y;
  const bx = b.x - center.x;
  const by = b.y - center.y;
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  const ux = ax / aLength;
  const uy = ay / aLength;
  const vx = bx / bLength;
  const vy = by / bLength;
  const angle = Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
  const deviationDeg = (Math.PI - angle) * 180 / Math.PI;
  return deviationDeg <= straightAngleToleranceDeg ? 'intermediate' : 'corner';
}
