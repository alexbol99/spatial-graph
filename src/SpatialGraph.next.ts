import type { AbstractGraph } from 'graphology-types';
import { canonicalPoint, pointKey, validatePrecision } from './internal/coordinates.js';
import { createStorage, edgeSnapshot, nodeSnapshot } from './internal/storage.js';
import type { StoredEdge, StoredNode } from './internal/storage.js';
import { toGraphology as createDetachedGraphology } from './adapters/graphology.js';
import { SpatialNode } from './SpatialNode.js';
import { SpatialEdge } from './SpatialEdge.js';
import type { CoordinatePrecision, EdgeData, NodeData, NodeType, Point2D, Segment2D } from './types.js';

export interface SpatialGraphOptions<N extends object> {
  coordinatePrecision?: CoordinatePrecision;
  straightAngleToleranceDeg?: number;
  /** Required for edges that create endpoint nodes with generic attributes. */
  createNodeAttributes?: () => N;
}

export type NodeInput<N extends object> = Point2D | SpatialNode<N>;
export type EdgeInput<N extends object, E extends object> = Segment2D | SpatialEdge<N, E>;

export type EdgeInsertResult<N extends object, E extends object> =
  | { readonly status: 'added' | 'existing'; readonly edge: SpatialEdge<N, E>; readonly endpoints: Segment2D }
  | { readonly status: 'collapsed'; readonly edge: null; readonly endpoints: Segment2D };

/** A 2D simple undirected graph with private Graphology storage. */
export class SpatialGraph<N extends object = NodeData, E extends object = EdgeData> {
  private readonly graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>;
  readonly coordinatePrecision: CoordinatePrecision;
  readonly straightAngleToleranceDeg: number;
  private readonly createNodeAttributes?: () => N;

  /** Create an empty graph. Invalid precision or angle tolerance throws before storage is created. */
  constructor(options: SpatialGraphOptions<N> = {}) {
    this.coordinatePrecision = options.coordinatePrecision ?? null;
    validatePrecision(this.coordinatePrecision);
    this.straightAngleToleranceDeg = options.straightAngleToleranceDeg ?? 1e-7;
    if (!Number.isFinite(this.straightAngleToleranceDeg)
      || this.straightAngleToleranceDeg < 0 || this.straightAngleToleranceDeg >= 90) {
      throw new RangeError('straightAngleToleranceDeg must be finite and in [0, 90).');
    }
    this.createNodeAttributes = options.createNodeAttributes;
    this.graph = createStorage<N, E>();
  }

  /** Number of current nodes. */
  get nodeCount(): number { return this.graph.order; }

  /** Number of current edges. */
  get edgeCount(): number { return this.graph.size; }

  /** Canonical coordinate key; throws for non-finite or unquantizable points. */
  getNodeKey(point: Point2D): string {
    return pointKey(canonicalPoint(point, this.coordinatePrecision));
  }

  private keyOf(node: NodeInput<N>): string {
    return this.getNodeKey(node instanceof SpatialNode ? node.point : node);
  }

  private segmentOf(edge: EdgeInput<N, E>): Segment2D {
    return edge instanceof SpatialEdge ? edge.endpoints : edge;
  }

  private nodeSnapshot(key: string, cache?: Map<string, SpatialNode<N>>): SpatialNode<N> {
    return nodeSnapshot(this.graph, key, this.straightAngleToleranceDeg, cache);
  }

  private edgeSnapshot(key: string, cache?: Map<string, SpatialNode<N>>): SpatialEdge<N, E> {
    return edgeSnapshot(this.graph, key, this.straightAngleToleranceDeg, cache);
  }

  /** Add or update a node at its canonical point; returns a fresh snapshot. */
  addNode(point: Point2D, attributes: N): SpatialNode<N> {
    const canonical = canonicalPoint(point, this.coordinatePrecision);
    const key = pointKey(canonical);
    if (this.graph.hasNode(key)) {
      const existing = this.graph.getNodeAttributes(key);
      this.graph.replaceNodeAttributes(key, { ...existing, data: { ...existing.data, ...attributes } });
    } else {
      this.graph.addNode(key, { x: canonical[0], y: canonical[1], data: { ...attributes } });
    }
    return this.nodeSnapshot(key);
  }

  /** Get a current node, or null when its canonical position is absent. */
  getNode(node: NodeInput<N>): SpatialNode<N> | null {
    const key = this.keyOf(node);
    return this.graph.hasNode(key) ? this.nodeSnapshot(key) : null;
  }

  /** Check membership at a canonical position. */
  hasNode(node: NodeInput<N>): boolean { return this.graph.hasNode(this.keyOf(node)); }

  /** Get snapshots of all current nodes in insertion order. */
  getNodes(): SpatialNode<N>[] {
    return this.graph.nodes().map((key) => this.nodeSnapshot(key));
  }

  /** Get canonical coordinates of current nodes. */
  getNodePoints(): Point2D[] { return this.getNodes().map((node) => node.point); }

  /** Get current neighbors, or an empty array when the node is absent. */
  getNeighbors(node: NodeInput<N>): SpatialNode<N>[] {
    const key = this.keyOf(node);
    return this.graph.hasNode(key) ? this.graph.neighbors(key).map((neighbor) => this.nodeSnapshot(neighbor)) : [];
  }

  /** Get current classification, or null when the node is absent. */
  getNodeType(node: NodeInput<N>): NodeType | null { return this.getNode(node)?.type ?? null; }

  /** Get current degree, or null when the node is absent. */
  getNodeDegree(node: NodeInput<N>): number | null { return this.getNode(node)?.degree ?? null; }

  /** Get copied current metadata, or null when the node is absent. */
  getNodeAttributes(node: NodeInput<N>): Readonly<N> | null { return this.getNode(node)?.attributes ?? null; }

  /** Merge metadata into an existing node; returns null when absent. */
  mergeNodeAttributes(node: NodeInput<N>, attributes: Partial<N>): SpatialNode<N> | null {
    const key = this.keyOf(node);
    if (!this.graph.hasNode(key)) return null;
    const existing = this.graph.getNodeAttributes(key);
    this.graph.replaceNodeAttributes(key, { ...existing, data: { ...existing.data, ...attributes } });
    return this.nodeSnapshot(key);
  }

  /** Remove a node and incident edges; returns false when absent. */
  removeNode(node: NodeInput<N>): boolean {
    const key = this.keyOf(node);
    if (!this.graph.hasNode(key)) return false;
    this.graph.dropNode(key);
    return true;
  }

  /**
   * Add a segment or report an existing/collapsed one. Missing endpoints use
   * createNodeAttributes; without a factory, add those nodes explicitly first.
   * @throws For invalid coordinates or missing endpoint metadata factory.
   */
  addEdge(endpoints: Segment2D, attributes: E): EdgeInsertResult<N, E> {
    const start = canonicalPoint(endpoints[0], this.coordinatePrecision);
    const end = canonicalPoint(endpoints[1], this.coordinatePrecision);
    const canonical = Object.freeze([Object.freeze(start), Object.freeze(end)] as const);
    const sourceKey = pointKey(start);
    const targetKey = pointKey(end);
    if (sourceKey === targetKey) return { status: 'collapsed', edge: null, endpoints: canonical };
    if (!Number.isFinite(Math.hypot(end[0] - start[0], end[1] - start[1]))) {
      throw new RangeError('Edge length must be finite; use endpoints with a representable separation.');
    }
    const existing = this.graph.hasNode(sourceKey) && this.graph.hasNode(targetKey)
      ? this.graph.undirectedEdge(sourceKey, targetKey)
      : undefined;
    if (existing !== undefined) {
      return { status: 'existing', edge: this.edgeSnapshot(existing), endpoints: canonical };
    }
    const missing = [sourceKey, targetKey].filter((key) => !this.graph.hasNode(key));
    if (missing.length > 0 && !this.createNodeAttributes) {
      throw new Error('Edge endpoints are missing. Add them with addNode or provide createNodeAttributes.');
    }
    // Prepare generated attributes before mutating graph storage.
    const prepared = new Map<string, N>();
    if (missing.includes(sourceKey)) prepared.set(sourceKey, this.createNodeAttributes!());
    if (missing.includes(targetKey)) prepared.set(targetKey, this.createNodeAttributes!());
    for (const [key, data] of prepared) {
      const point = key === sourceKey ? start : end;
      this.graph.addNode(key, { x: point[0], y: point[1], data: { ...data } });
    }
    const key = this.graph.addUndirectedEdge(sourceKey, targetKey, { data: { ...attributes } });
    return { status: 'added', edge: this.edgeSnapshot(key), endpoints: canonical };
  }

  /** Get the current edge by endpoints, or null when absent. */
  getEdge(edge: EdgeInput<N, E>): SpatialEdge<N, E> | null {
    const endpoints = this.segmentOf(edge);
    const sourceKey = this.getNodeKey(endpoints[0]);
    const targetKey = this.getNodeKey(endpoints[1]);
    const key = this.graph.hasNode(sourceKey) && this.graph.hasNode(targetKey)
      ? this.graph.undirectedEdge(sourceKey, targetKey)
      : undefined;
    return key === undefined ? null : this.edgeSnapshot(key);
  }

  /** Get the current edge between two nodes, or null when absent. */
  getEdgeBetween(a: NodeInput<N>, b: NodeInput<N>): SpatialEdge<N, E> | null {
    return this.getEdge([a instanceof SpatialNode ? a.point : a, b instanceof SpatialNode ? b.point : b]);
  }

  /** Get all edge snapshots in Graphology insertion order. */
  getEdges(): SpatialEdge<N, E>[] {
    const cache = new Map<string, SpatialNode<N>>();
    return this.graph.edges().map((key) => this.edgeSnapshot(key, cache));
  }

  /** Get canonical endpoint segments of current edges. */
  getEdgeSegments(): Segment2D[] { return this.getEdges().map((edge) => edge.endpoints); }

  /** Get the current edge's midpoint, or null when absent. */
  getEdgeMidpoint(edge: EdgeInput<N, E>): Point2D | null { return this.getEdge(edge)?.midpoint ?? null; }

  /** Get the current edge's length, or null when absent. */
  getEdgeLength(edge: EdgeInput<N, E>): number | null { return this.getEdge(edge)?.length ?? null; }

  /** Get copied current edge metadata, or null when absent. */
  getEdgeAttributes(edge: EdgeInput<N, E>): Readonly<E> | null { return this.getEdge(edge)?.attributes ?? null; }

  /** Remove an edge by endpoints; returns false when absent. */
  removeEdge(edge: EdgeInput<N, E>): boolean {
    const endpoints = this.segmentOf(edge);
    const sourceKey = this.getNodeKey(endpoints[0]);
    const targetKey = this.getNodeKey(endpoints[1]);
    const key = this.graph.hasNode(sourceKey) && this.graph.hasNode(targetKey)
      ? this.graph.undirectedEdge(sourceKey, targetKey)
      : undefined;
    if (key === undefined) return false;
    this.graph.dropEdge(key);
    return true;
  }

  /** Return an independent Graphology graph for interoperability. */
  toGraphology(): AbstractGraph<{ x: number; y: number; data: N }, { length: number; data: E }> {
    return createDetachedGraphology(this.graph);
  }
}
