import type { SpatialNode } from './SpatialNode.js';
import type { SpatialEdge } from './SpatialEdge.js';

/** Planar Cartesian coordinates; a coordinate value does not imply membership. */
export type Point2D = readonly [x: number, y: number];
export type Vector2D = readonly [x: number, y: number];
export type Segment2D = readonly [start: Point2D, end: Point2D];
/** null preserves coordinates; 0..15 quantizes decimal places. */
export type CoordinatePrecision = number | null;
export type NodeType = 'isolated' | 'stub' | 'intermediate' | 'corner' | 'junction';
export interface NodeAttributes { label?: string; [name: string]: unknown }
export interface EdgeAttributes { label?: string; [name: string]: unknown }
export type NodeInput<N extends object = NodeAttributes> = Point2D | SpatialNode<N>;
export type EdgeInput<N extends object = NodeAttributes, E extends object = EdgeAttributes> = Segment2D | SpatialEdge<N, E>;
/** Required attribute fields require an explicit argument. */
export type AttributeArgs<T extends object> = {} extends T ? [attributes?: T] : [attributes: T];
/** Respect a declared label's string type; null removal requires an optional field. */
export type LabelInput<T extends object> = 'label' extends keyof T
  ? (string extends T[Extract<'label', keyof T>] ? string : Extract<T[Extract<'label', keyof T>], string>)
    | (undefined extends T[Extract<'label', keyof T>] ? null : never)
  : string | null;
export interface SpatialGraphConfig<N extends object, E extends object> {
  coordinatePrecision?: CoordinatePrecision;
  positionTolerance?: number;
  straightAngleToleranceDeg?: number;
  createNodeAttributes?: () => N;
  cloneNodeAttributes?: (attributes: N) => N;
  cloneEdgeAttributes?: (attributes: E) => E;
}
/** Required node fields need a factory for implicit edge endpoints and split nodes. */
export type SpatialGraphOptions<N extends object = NodeAttributes, E extends object = EdgeAttributes> =
  SpatialGraphConfig<N, E> & ({} extends N ? {} : { createNodeAttributes: () => N });
export type ConstructorArgs<N extends object, E extends object> = {} extends N
  ? [options?: SpatialGraphOptions<N, E>] : [options: SpatialGraphOptions<N, E>];
export type GraphologyImportOptions<N extends object, E extends object> = SpatialGraphOptions<N, E> & {
  mapNodeAttributes?: (attributes: Record<string, unknown>) => N;
  mapEdgeAttributes?: (attributes: Record<string, unknown>) => E;
};
export type GraphologyImportArgs<N extends object, E extends object> = {} extends N
  ? [options?: GraphologyImportOptions<N, E>] : [options: GraphologyImportOptions<N, E>];
export type EdgeInsertResult<N extends object = NodeAttributes, E extends object = EdgeAttributes> =
  | { readonly status: 'added' | 'existing'; readonly edge: SpatialEdge<N, E>; readonly endpoints: Segment2D }
  | { readonly status: 'collapsed'; readonly edge: null; readonly endpoints: Segment2D };
export interface EdgeRecord<E extends object = EdgeAttributes> { endpoints: Segment2D; attributes: E }
export interface BatchInsertResult<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  results: EdgeInsertResult<N, E>[];
  added: number; existing: number; collapsed: number;
}
export interface ConflictOptions<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  /** The first dictionary is the deterministic winner under the default policy. */
  mergeNodeAttributes?: (winner: Readonly<N>, incoming: Readonly<N>) => N;
  mergeEdgeAttributes?: (winner: Readonly<E>, incoming: Readonly<E>) => E;
}
export interface MutationReport {
  changed: boolean;
  moved: Array<{ from: string; to: string }>;
  mergedNodes: number; collapsedEdges: number; mergedEdges: number;
}
export interface SplitOptions<N extends object = NodeAttributes, E extends object = EdgeAttributes> extends ConflictOptions<N, E> {
  splitAttributes?: (edge: SpatialEdge<N, E>, endpoints: Segment2D, index: 0 | 1) => E;
}
export interface SplitResult<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  changed: boolean; reason?: 'missing' | 'endpoint';
  node: SpatialNode<N> | null; removed: SpatialEdge<N, E> | null; edges: SpatialEdge<N, E>[];
}
export interface JoinOptions<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  joinAttributes?: (first: SpatialEdge<N, E>, second: SpatialEdge<N, E>) => E;
}
export interface JoinResult<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  changed: boolean; reason?: 'missing' | 'degree' | 'bend' | 'connected'; edge: SpatialEdge<N, E> | null;
}
export interface NearestEdgeResult<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  readonly edge: SpatialEdge<N, E>; readonly point: Point2D;
  readonly distance: number; readonly t: number; readonly clamped: boolean;
}
export interface SpatialPath<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  readonly nodes: readonly SpatialNode<N>[]; readonly edges: readonly SpatialEdge<N, E>[];
  readonly length: number; readonly cost: number; readonly closed: boolean;
}
export interface PathOptions<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  algorithm?: 'dijkstra' | 'astar';
  /** null closes the edge; zero is a valid cost. */
  cost?: (edge: SpatialEdge<N, E>) => number | null;
  /** Finite, nonnegative, admissible, zero at the goal. Nodes may reopen. */
  heuristic?: (node: SpatialNode<N>, goal: SpatialNode<N>) => number;
}
export interface RouteResult<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  readonly from: NearestEdgeResult<N, E>; readonly to: NearestEdgeResult<N, E>;
  readonly points: readonly Point2D[]; readonly length: number; readonly cost: number;
}
export interface SpatialGraphJSON<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  schema: 'spatial-graph'; version: 2;
  options: { coordinatePrecision: CoordinatePrecision; positionTolerance: number; straightAngleToleranceDeg: number };
  attributes: Record<string, unknown>;
  nodes: Array<{ key: string; point: Point2D; attributes: N }>;
  edges: Array<{ key: string; source: string; target: string; attributes: E }>;
}
export type IntersectionResult = { type: 'none' } | { type: 'point'; point: Point2D }
  | { type: 'overlap'; endpoints: Segment2D };
export interface PlanarizeResult { changed: boolean; intersections: number; overlaps: number; unresolved: Point2D[] }
export interface NearbyMergeResult extends MutationReport { clusters: string[][]; maxDisplacement: number }
export interface GeoJSONFeature {
  type: 'Feature'; properties: Record<string, unknown> | null;
  geometry: { type: 'Point' | 'LineString' | 'MultiLineString'; coordinates: unknown };
}
export interface GeoJSONCollection { type: 'FeatureCollection'; features: GeoJSONFeature[] }
