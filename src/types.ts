import type { Multiline, Segment } from '@flatten-js/core';

// Types for the composition-based 2.0 facade. They are intentionally not
// exported from index.ts until the coordinated public API migration.
export type Point2D = readonly [x: number, y: number];
export type Segment2D = readonly [start: Point2D, end: Point2D];
export type CoordinatePrecision = number | null;
export type NodeType = 'isolated' | 'stub' | 'intermediate' | 'corner' | 'junction';
export interface NodeData {
  label?: string;
  [name: string]: unknown;
}
export interface EdgeData {
  label?: string;
  [name: string]: unknown;
}

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
