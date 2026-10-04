import type { Point, Segment, Multiline } from '@flatten-js/core';

/**
 * Represents a 2D point as a readonly tuple [x, y]
 */
export type NxPoint = readonly [number, number];

/**
 * Represents an edge as a pair of points
 */
export type NxEdge = readonly [NxPoint, NxPoint];

/**
 * Edge attributes stored in the graph
 */
export type EdgeAttributes = {
  weight: number;
  width?: number;
  clearanceWidth?: number;
  [key: string]: unknown;
};

/**
 * Node attributes stored in the graph
 */
export type NodeAttributes = {
  radius?: number;
  closestGeoms?: NxEdge[];
  [key: string]: unknown;
};

/**
 * Filter predicate function for filtering nodes
 */
export type FilterPredicate = (node: NxPoint, attrs: NodeAttributes) => boolean;

/**
 * Validation callback for edge creation
 */
export type IsValidCallback = (start: NxPoint, end: NxPoint) => boolean;

/**
 * Result type for intersection operations
 */
export type IntersectionResult = {
  point: NxPoint;
  edge1: NxEdge;
  edge2: NxEdge;
} | null;

/**
 * Constructor options for SpatialGraph
 */
export type SpatialGraphOptions = {
  /** Allow self-loops through raw graphology methods (default: true). */
  allowSelfLoops?: boolean;
  segments?: Array<Segment | Multiline>;
  attrs?: Array<Record<string, unknown>>;
};

/**
 * Re-export flatten-js types for convenience
 */
export type { Point, Segment, Multiline };
