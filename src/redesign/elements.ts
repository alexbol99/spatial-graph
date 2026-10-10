import { Point, Segment } from '@flatten-js/core';
import type { Point2D, Segment2D } from './coordinates.js';

export type NodeType = 'isolated' | 'stub' | 'intermediate' | 'corner' | 'junction';

export interface NodeAttributes {
  label?: string;
  [name: string]: unknown;
}

export interface EdgeAttributes {
  label?: string;
  [name: string]: unknown;
}

const snapshotToken = Symbol('SpatialGraph snapshot');

/** An immutable view of a node at one graph revision. */
export class SpatialNode<N extends object = NodeAttributes> {
  readonly key: string;
  readonly point: Point2D;
  readonly degree: number;
  readonly type: NodeType;
  readonly attributes: Readonly<N>;

  /** @internal Constructed by SpatialGraph; use graph.getNode instead. */
  constructor(token: symbol, key: string, point: Point2D, degree: number, type: NodeType, attributes: N) {
    if (token !== snapshotToken) throw new TypeError('Use graph.getNode to obtain a SpatialNode.');
    this.key = key;
    this.point = Object.freeze([point[0], point[1]] as const);
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
    return Math.hypot(this.point[0] - other.point[0], this.point[1] - other.point[1]);
  }

  /** Create an independent Flatten point. */
  toFlattenPoint(): Point {
    return new Point(this.point[0], this.point[1]);
  }
}

/** An immutable view of an undirected edge at one graph revision. */
export class SpatialEdge<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  readonly key: string;
  readonly source: SpatialNode<N>;
  readonly target: SpatialNode<N>;
  readonly endpoints: Segment2D;
  readonly attributes: Readonly<E>;

  /** @internal Constructed by SpatialGraph; use graph.getEdge instead. */
  constructor(token: symbol, key: string, source: SpatialNode<N>, target: SpatialNode<N>, attributes: E) {
    if (token !== snapshotToken) throw new TypeError('Use graph.getEdge to obtain a SpatialEdge.');
    this.key = key;
    this.source = source;
    this.target = target;
    this.endpoints = Object.freeze([source.point, target.point] as const);
    this.attributes = Object.freeze({ ...attributes }) as Readonly<E>;
    Object.freeze(this);
  }

  /** Arithmetic midpoint of the canonical endpoints; it need not be a node. */
  get midpoint(): Point2D {
    return Object.freeze([
      this.source.point[0] / 2 + this.target.point[0] / 2,
      this.source.point[1] / 2 + this.target.point[1] / 2,
    ] as const);
  }

  /** Euclidean length of the canonical segment. */
  get length(): number {
    return Math.hypot(
      this.target.point[0] - this.source.point[0],
      this.target.point[1] - this.source.point[1],
    );
  }

  /** Compare endpoint positions regardless of orientation or Graphology edge key. */
  equals(other: SpatialEdge<N, E>): boolean {
    return (this.source.key === other.source.key && this.target.key === other.target.key)
      || (this.source.key === other.target.key && this.target.key === other.source.key);
  }

  /** Create an independent Flatten segment. */
  toFlattenSegment(): Segment {
    return new Segment(this.source.toFlattenPoint(), this.target.toFlattenPoint());
  }
}

/** @internal Snapshot construction remains inside the redesign implementation. */
export function makeNode<N extends object>(
  key: string, point: Point2D, degree: number, type: NodeType, attributes: N,
): SpatialNode<N> {
  return new SpatialNode(snapshotToken, key, point, degree, type, attributes);
}

/** @internal Snapshot construction remains inside the redesign implementation. */
export function makeEdge<N extends object, E extends object>(
  key: string, source: SpatialNode<N>, target: SpatialNode<N>, attributes: E,
): SpatialEdge<N, E> {
  return new SpatialEdge(snapshotToken, key, source, target, attributes);
}
