import { Point } from '@flatten-js/core';
import type { NodeAttributes, NodeType, Point2D } from './types.js';
import { distance, freezePoint } from './utils/geometry.js';
import { snapshotToken } from './internal/snapshotToken.js';

/** An immutable view of a node at one graph revision. */
export class SpatialNode<N extends object = NodeAttributes> {
  readonly key: string;
  readonly point: Point2D;
  readonly degree: number;
  readonly type: NodeType;
  readonly attributes: Readonly<N>;

  /** @internal Constructed by SpatialGraph; use graph.getNode instead. */
  constructor(
    token: symbol,
    key: string,
    point: Point2D,
    degree: number,
    type: NodeType,
    attributes: N,
  ) {
    if (token !== snapshotToken) {
      throw new TypeError('Use graph.getNode to obtain a SpatialNode.');
    }
    this.key = key;
    this.point = freezePoint(point);
    this.degree = degree;
    this.type = type;
    this.attributes = Object.freeze({ ...attributes }) as Readonly<N>;
    Object.freeze(this);
  }

  /** Compare canonical positions within one graph's coordinate policy. */
  equals(other: SpatialNode<N>): boolean {
    return this.key === other.key;
  }

  /** Euclidean distance, including for snapshots retained after removal. */
  distanceTo(other: SpatialNode<N>): number {
    return distance(this.point, other.point);
  }

  /** Create an independent Flatten point. */
  toFlattenPoint(): Point {
    return new Point(this.point[0], this.point[1]);
  }
}
