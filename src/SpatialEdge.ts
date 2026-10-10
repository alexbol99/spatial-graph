import { Segment } from '@flatten-js/core';
import type { EdgeAttributes, NodeAttributes, Point2D, Segment2D } from './types.js';
import { distance, freezePoint, midpoint } from './utils/geometry.js';
import { SpatialNode } from './SpatialNode.js';
import { snapshotToken } from './internal/snapshotToken.js';

/** An immutable view of an undirected edge at one graph revision. */
export class SpatialEdge<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  readonly key: string;
  readonly source: SpatialNode<N>;
  readonly target: SpatialNode<N>;
  readonly endpoints: Segment2D;
  readonly attributes: Readonly<E>;

  /** @internal Constructed by SpatialGraph; use graph.getEdge instead. */
  constructor(
    token: symbol,
    key: string,
    source: SpatialNode<N>,
    target: SpatialNode<N>,
    attributes: E,
  ) {
    if (token !== snapshotToken) {
      throw new TypeError('Use graph.getEdge to obtain a SpatialEdge.');
    }
    this.key = key;
    this.source = source;
    this.target = target;
    this.endpoints = Object.freeze([source.point, target.point] as const);
    this.attributes = Object.freeze({ ...attributes }) as Readonly<E>;
    Object.freeze(this);
  }

  /** Arithmetic midpoint of the canonical endpoints; it need not be a node. */
  get midpoint(): Point2D {
    return freezePoint(midpoint(this.endpoints));
  }

  /** Euclidean length of the canonical segment. */
  get length(): number {
    return distance(...this.endpoints);
  }

  /** Compare endpoint positions regardless of orientation or Graphology edge key. */
  equals(other: SpatialEdge<N, E>): boolean {
    return (
      (this.source.key === other.source.key && this.target.key === other.target.key) ||
      (this.source.key === other.target.key && this.target.key === other.source.key)
    );
  }

  /** Create an independent Flatten segment. */
  toFlattenSegment(): Segment {
    return new Segment(this.source.toFlattenPoint(), this.target.toFlattenPoint());
  }
}
