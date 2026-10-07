import type { Multiline, Segment } from '@flatten-js/core';

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
  [key: string]: unknown;
};

/**
 * Node attributes stored in the graph
 */
export type NodeAttributes = {
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
 * Constructor options for SpatialGraph
 */
export type SpatialGraphOptions = {
  /** Allow self-loops through raw graphology methods (default: true). */
  allowSelfLoops?: boolean;
  segments?: Array<Segment | Multiline>;
  attrs?: Array<Record<string, unknown>>;
};
