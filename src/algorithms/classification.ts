import type { AbstractGraph } from 'graphology-types';
import type { NodeType } from '../types.js';
import type { StoredEdge, StoredNode } from '../internal/storage.js';
import { angleDegrees, pointOf, vector } from '../utils/geometry.js';

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
  const center = pointOf(graph.getNodeAttributes(key));
  const [aKey, bKey] = graph.neighbors(key);
  if (aKey === undefined || bKey === undefined) {
    throw new Error('Graph storage is inconsistent: a degree-2 node has fewer than two neighbors.');
  }
  const directions = [aKey, bKey].map((neighbor) => vector(center, pointOf(graph.getNodeAttributes(neighbor))));
  const deviationDeg = 180 - angleDegrees(directions[0]!, directions[1]!);
  return deviationDeg <= straightAngleToleranceDeg ? 'intermediate' : 'corner';
}
