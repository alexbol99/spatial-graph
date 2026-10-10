import type { AbstractGraph } from 'graphology-types';
import { connectedComponents } from 'graphology-components';
import {
  bfs as graphologyBfs,
  bfsFromNode as graphologyBfsFromNode,
  dfs as graphologyDfs,
  dfsFromNode as graphologyDfsFromNode,
} from 'graphology-traversal';
import { Point, Segment } from '@flatten-js/core';
import { canonicalPoint, pointKey, validatePrecision, parseKey } from './internal/coordinates.js';
import { createStorage, edgeSnapshot, nodeSnapshot } from './internal/storage.js';
import type { StoredEdge, StoredNode } from './internal/storage.js';
import { emptyPlan, mergeData, planMoves } from './internal/mutations.js';
import type { MutationPlan } from './internal/mutations.js';
import { SpatialIndex, bounds } from './internal/spatialIndex.js';
import { toGraphology as detachedGraphology } from './adapters/graphology.js';
import { SpatialNode } from './SpatialNode.js';
import { SpatialEdge } from './SpatialEdge.js';
import {
  angleDegrees,
  compareKeys,
  copyData,
  distance,
  freezePoint,
  pairKey,
  pointOf,
  validateAngle,
  validateSegment,
  validateTolerance,
  vector,
} from './utils/geometry.js';
import { projectPoint } from './utils/projection.js';
import { intersectSegments } from './utils/intersection.js';
import { decompose } from './algorithms/traversal.js';
import { shortestPath } from './algorithms/routing.js';
import { PathAlgorithm } from './types.js';
import { nearestKey } from './algorithms/nearest.js';
import { classifyNode } from './algorithms/classification.js';
import { decodeGraphJSON, decodeLegacyJSON } from './adapters/serialization.js';
import { decodeGraphology } from './adapters/graphology.js';
import { decodeGeoJSON, encodeGeoJSON } from './adapters/geojson.js';
import { flattenSegments } from './adapters/flatten.js';
import type {
  AttributeArgs,
  BatchInsertResult,
  ConflictOptions,
  ConstructorArgs,
  EdgeAttributes,
  EdgeInput,
  EdgeInsertResult,
  EdgeRecord,
  GeoJSONCollection,
  GraphologyImportArgs,
  JoinOptions,
  JoinResult,
  LabelInput,
  MutationReport,
  NearestEdgeResult,
  NearbyMergeResult,
  NodeAttributes,
  NodeInput,
  NodeType,
  PathOptions,
  PlanarizeResult,
  Point2D,
  RouteResult,
  Segment2D,
  SpatialGraphConfig,
  SpatialGraphJSON,
  SpatialPath,
  SplitOptions,
  SplitResult,
  Vector2D,
  TraversalCallback,
} from './types.js';

const VIRTUAL_SOURCE_KEY = '@from';
const VIRTUAL_TARGET_KEY = '@to';

/** A 2D, undirected, simple graph. Coordinates identify nodes; results are immutable snapshots. */
export class SpatialGraph<N extends object = NodeAttributes, E extends object = EdgeAttributes> {
  #graph: AbstractGraph<StoredNode<N>, StoredEdge<E>>;
  #nodeIndex = new SpatialIndex();
  #edgeIndex = new SpatialIndex();
  #busy = false;
  private edgeSequence = 0;
  private currentRevision = 0;
  private nodeCopies?: WeakMap<N, N>;
  private edgeCopies?: WeakMap<E, E>;
  private config: SpatialGraphConfig<N, E>;
  readonly coordinatePrecision: number | null;
  readonly positionTolerance: number;
  readonly straightAngleToleranceDeg: number;

  /**
   * Create an empty graph.
   * @throws For invalid options, precision, tolerances or callback types.
   */
  constructor(...args: ConstructorArgs<NoInfer<N>, NoInfer<E>>) {
    this.config = args[0] === undefined ? {} : copyData(args[0]);
    for (const name of [
      'createNodeAttributes',
      'cloneNodeAttributes',
      'cloneEdgeAttributes',
    ] as const) {
      if (this.config[name] !== undefined && typeof this.config[name] !== 'function') {
        throw new TypeError(
          `${name} must be a function; pass a metadata factory or clone callback.`,
        );
      }
    }
    this.coordinatePrecision = this.config.coordinatePrecision ?? null;
    this.positionTolerance = this.config.positionTolerance ?? 1e-9;
    this.straightAngleToleranceDeg = this.config.straightAngleToleranceDeg ?? 1e-7;
    validatePrecision(this.coordinatePrecision);
    validateTolerance(this.positionTolerance);
    validateAngle(this.straightAngleToleranceDeg);
    Object.defineProperties(this, {
      coordinatePrecision: { writable: false },
      positionTolerance: { writable: false },
      straightAngleToleranceDeg: { writable: false },
    });
    this.#graph = createStorage<N, E>();
  }

  /** Number of current nodes. */
  get nodeCount(): number {
    return this.#graph.order;
  }

  /** Number of current edges. */
  get edgeCount(): number {
    return this.#graph.size;
  }

  /** Changes after each committed operation; retained snapshots remain unchanged. */
  get revision(): number {
    return this.currentRevision;
  }

  private guarded<T>(operation: () => T): T {
    if (this.#busy) {
      throw new Error(
        'Cannot mutate or start another operation inside a graph callback; finish the current operation first.',
      );
    }
    this.#busy = true;
    this.nodeCopies = new WeakMap();
    this.edgeCopies = new WeakMap();
    try {
      return operation();
    } finally {
      this.#busy = false;
      this.nodeCopies = undefined;
      this.edgeCopies = undefined;
    }
  }

  private callback<T>(operation: () => T): T {
    const busy = this.#busy;
    this.#busy = true;
    try {
      return operation();
    } finally {
      this.#busy = busy;
    }
  }

  private cloneNode = (data: N): N =>
    copyData(
      this.config.cloneNodeAttributes
        ? this.callback(() => this.config.cloneNodeAttributes!(copyData(data)))
        : data,
    );

  private cloneEdge = (data: E): E =>
    copyData(
      this.config.cloneEdgeAttributes
        ? this.callback(() => this.config.cloneEdgeAttributes!(copyData(data)))
        : data,
    );

  private snapshotNodeCopy = (data: N): N => {
    const copy = this.nodeCopies?.get(data) ?? this.cloneNode(data);
    this.nodeCopies?.set(data, copy);
    return copy;
  };

  private snapshotEdgeCopy = (data: E): E => {
    const copy = this.edgeCopies?.get(data) ?? this.cloneEdge(data);
    this.edgeCopies?.set(data, copy);
    return copy;
  };

  private newNodeData(): N {
    // ConstructorArgs requires a factory when {} does not satisfy N.
    return this.cloneNode(
      this.config.createNodeAttributes
        ? this.callback(this.config.createNodeAttributes)
        : ({} as N),
    );
  }

  private canonical(point: Point2D): Point2D {
    return canonicalPoint(point, this.coordinatePrecision);
  }

  private pointOfInput(node: NodeInput<N>): Point2D {
    return node instanceof SpatialNode ? node.point : node;
  }

  private keyOf(node: NodeInput<N>): string {
    return this.getNodeKey(this.pointOfInput(node));
  }

  private segmentOf(edge: EdgeInput<N, E>): Segment2D {
    return edge instanceof SpatialEdge ? edge.endpoints : edge;
  }

  private edgeKey(edge: EdgeInput<N, E>): string | undefined {
    const [a, b] = this.segmentOf(edge).map((point) => this.getNodeKey(point)) as [string, string];
    return this.#graph.hasNode(a) && this.#graph.hasNode(b) ? this.#graph.edge(a, b) : undefined;
  }

  private segment(key: string): Segment2D {
    return this.#graph
      .extremities(key)
      .map((node) => pointOf(this.#graph.getNodeAttributes(node))) as unknown as Segment2D;
  }

  private nodeSnapshot(key: string, cache?: Map<string, SpatialNode<N>>): SpatialNode<N> {
    return nodeSnapshot(
      this.#graph,
      key,
      this.straightAngleToleranceDeg,
      cache,
      this.snapshotNodeCopy,
    );
  }

  private edgeSnapshot(key: string, cache?: Map<string, SpatialNode<N>>): SpatialEdge<N, E> {
    return edgeSnapshot(
      this.#graph,
      key,
      this.straightAngleToleranceDeg,
      cache,
      this.snapshotNodeCopy,
      this.snapshotEdgeCopy,
    );
  }

  private nextEdgeKey(reserved: Set<string> = new Set()): string {
    let key: string;
    do {
      key = `e${this.edgeSequence++}`;
    } while (this.#graph.hasEdge(key) || reserved.has(key));
    return key;
  }

  private apply(plan: MutationPlan<N, E>): void {
    // Clone hooks for returned snapshots run before storage commits.
    for (const record of plan.nodes.values()) {
      this.snapshotNodeCopy(record.data);
    }
    for (const edge of plan.edges) {
      this.snapshotEdgeCopy(edge.data);
      for (const node of [edge.source, edge.target]) {
        this.snapshotNodeCopy((plan.nodes.get(node) ?? this.#graph.getNodeAttributes(node)).data);
      }
    }

    const reserved = new Set(
      plan.edges.flatMap((edge) => (edge.key === undefined ? [] : [edge.key])),
    );
    for (const key of new Set([
      ...plan.removeEdges,
      ...plan.removeNodes.flatMap((node) => this.#graph.edges(node)),
    ])) {
      this.#edgeIndex.remove(key);
      if (this.#graph.hasEdge(key)) {
        this.#graph.dropEdge(key);
      }
    }
    for (const key of plan.removeNodes) {
      this.#nodeIndex.remove(key);
      this.#graph.dropNode(key);
    }
    for (const [key, record] of plan.nodes) {
      if (this.#graph.hasNode(key)) {
        this.#graph.replaceNodeAttributes(key, record);
      } else {
        this.#graph.addNode(key, record);
      }
      this.#nodeIndex.set(key, bounds([pointOf(record), pointOf(record)]));
    }
    for (const edge of plan.edges) {
      const existing = this.#graph.edge(edge.source, edge.target);

      if (existing !== undefined) {
        this.#graph.replaceEdgeAttributes(existing, { data: edge.data });
      } else {
        const key = edge.key ?? this.nextEdgeKey(reserved);
        this.#graph.addUndirectedEdgeWithKey(key, edge.source, edge.target, { data: edge.data });
        this.#edgeIndex.set(key, bounds(this.segment(key)));
      }
    }
    if (
      plan.removeNodes.length ||
      plan.removeEdges.length ||
      plan.nodes.size ||
      plan.edges.length
    ) {
      this.currentRevision++;
    }
  }

  /** Canonical coordinate key. @throws For non-finite or unquantizable coordinates. */
  getNodeKey(point: Point2D): string {
    return pointKey(this.canonical(point));
  }

  /**
   * Current node at the input's canonical position, or null when absent.
   * @throws For invalid coordinates/options.
   */
  getNode(node: NodeInput<N>): SpatialNode<N> | null {
    const key = this.keyOf(node);
    return this.#graph.hasNode(key) ? this.nodeSnapshot(key) : null;
  }

  /**
   * Current node by canonical key, or null when absent.
   * @throws For malformed/noncanonical keys.
   */
  getNodeByKey(key: string): SpatialNode<N> | null {
    if (this.getNodeKey(parseKey(key)) !== key) {
      throw new Error('Node key is not canonical; obtain it with getNodeKey(point).');
    }

    return this.#graph.hasNode(key) ? this.nodeSnapshot(key) : null;
  }

  /** Membership at a canonical position. @throws For invalid coordinates/options. */
  hasNode(node: NodeInput<N>): boolean {
    return this.#graph.hasNode(this.keyOf(node));
  }

  /** Upsert a node; supplied attributes win. @throws For invalid coordinates/metadata. */
  addNode(point: Point2D, ...args: AttributeArgs<N>): SpatialNode<N> {
    return this.guarded(() => {
      const canonical = this.canonical(point);
      const key = pointKey(canonical);
      const data = this.cloneNode((args[0] ?? {}) as N);
      const plan = emptyPlan<N, E>();
      plan.nodes.set(key, {
        x: canonical[0],
        y: canonical[1],
        data: this.#graph.hasNode(key)
          ? { ...this.#graph.getNodeAttributes(key).data, ...data }
          : data,
      });
      this.apply(plan);
      return this.nodeSnapshot(key);
    });
  }

  /** Snapshots of all current nodes in insertion order. */
  getNodes(): SpatialNode<N>[] {
    return this.#graph.nodes().map((key) => this.nodeSnapshot(key));
  }

  /** Coordinates of all nodes, without topology materialization. */
  getNodePoints(): Point2D[] {
    return this.#graph
      .nodes()
      .map((key) => freezePoint(pointOf(this.#graph.getNodeAttributes(key))));
  }

  /** Neighbors in insertion order; [] when absent. @throws For invalid coordinates/options. */
  getNeighbors(node: NodeInput<N>): SpatialNode<N>[] {
    const key = this.keyOf(node);

    if (!this.#graph.hasNode(key)) {
      return [];
    }

    return this.#graph.neighbors(key).map((key) => this.nodeSnapshot(key));
  }

  /** Classification now; null when absent. @throws For invalid coordinates/options. */
  getNodeType(node: NodeInput<N>): NodeType | null {
    const key = this.keyOf(node);

    if (!this.#graph.hasNode(key)) {
      return null;
    }

    return classifyNode(this.#graph, key, this.straightAngleToleranceDeg);
  }

  /** Current degree; null when absent. @throws For invalid coordinates/options. */
  getNodeDegree(node: NodeInput<N>): number | null {
    const key = this.keyOf(node);
    return this.#graph.hasNode(key) ? this.#graph.degree(key) : null;
  }

  /** Nodes with the specified current classification. */
  getNodesByType(type: NodeType): SpatialNode<N>[] {
    return this.getNodes().filter((node) => node.type === type);
  }

  /** Current junctions. */
  getJunctions(): SpatialNode<N>[] {
    return this.getNodesByType('junction');
  }

  /** Current dead ends. */
  getStubs(): SpatialNode<N>[] {
    return this.getNodesByType('stub');
  }

  /** Current copied node metadata; null when absent. @throws For invalid coordinates/options. */
  getNodeAttributes(node: NodeInput<N>): Readonly<N> | null {
    const key = this.keyOf(node);

    if (!this.#graph.hasNode(key)) {
      return null;
    }

    const attributes = this.#graph.getNodeAttributes(key).data;
    return Object.freeze(this.cloneNode(attributes));
  }

  /**
   * Merge into an existing node; null when absent. No implicit node creation.
   * @throws For invalid coordinates/options.
   */
  mergeNodeAttributes(node: NodeInput<N>, attributes: Partial<N>): SpatialNode<N> | null {
    return this.guarded(() => {
      const key = this.keyOf(node);

      if (!this.#graph.hasNode(key)) {
        return null;
      }

      const record = this.#graph.getNodeAttributes(key);
      const data = this.cloneNode({ ...record.data, ...copyData(attributes) });
      this.snapshotNodeCopy(data);
      this.#graph.replaceNodeAttributes(key, { ...record, data });
      this.currentRevision++;
      return this.nodeSnapshot(key);
    });
  }

  /**
   * Remove a node and its incident edges; false when absent.
   * @throws For invalid coordinates/options.
   */
  removeNode(node: NodeInput<N>): boolean {
    return this.removeNodes([node]) > 0;
  }

  /** Remove nodes atomically; returns the number removed. @throws For invalid coordinates. */
  removeNodes(nodes: readonly NodeInput<N>[]): number {
    return this.guarded(() => {
      const keys = [...new Set(nodes.map((node) => this.keyOf(node)))].filter((key) =>
        this.#graph.hasNode(key),
      );
      const plan = emptyPlan<N, E>();
      plan.removeNodes = keys;
      this.apply(plan);
      return keys.length;
    });
  }

  /**
   * Remove a dead end; false for missing/non-stub nodes.
   * @throws For invalid coordinates/options.
   */
  removeStubNode(node: NodeInput<N>): boolean {
    return this.getNodeDegree(node) === 1 && this.removeNode(node);
  }

  private insert(records: readonly EdgeRecord<E>[]): BatchInsertResult<N, E> {
    const plan = emptyPlan<N, E>();
    const known = new Set<string>();
    const prepared = records.map(({ endpoints, attributes }) => {
      const segment: Segment2D = [
        freezePoint(this.canonical(endpoints[0])),
        freezePoint(this.canonical(endpoints[1])),
      ];
      validateSegment(segment);
      return { endpoints: segment, attributes: this.cloneEdge(attributes) };
    });
    const statuses: Array<'added' | 'existing' | 'collapsed'> = [];

    for (const { endpoints, attributes } of prepared) {
      const [a, b] = endpoints.map(pointKey) as [string, string];
      const pair = pairKey(a, b);

      if (a === b) {
        statuses.push('collapsed');
        continue;
      }
      if (
        known.has(pair) ||
        (this.#graph.hasNode(a) && this.#graph.hasNode(b) && this.#graph.hasEdge(a, b))
      ) {
        statuses.push('existing');
        continue;
      }
      known.add(pair);
      for (const point of endpoints) {
        const key = pointKey(point);

        if (!this.#graph.hasNode(key) && !plan.nodes.has(key)) {
          plan.nodes.set(key, { x: point[0], y: point[1], data: this.newNodeData() });
        }
      }
      plan.edges.push({ source: a, target: b, data: attributes });
      statuses.push('added');
    }
    // Existing inputs are also returned; materialize their clone hooks before committing the batch.
    for (const { endpoints } of prepared) {
      const key = this.edgeKey(endpoints);

      if (key !== undefined) {
        this.edgeSnapshot(key);
      }
    }
    this.apply(plan);
    const results = prepared.map(
      ({ endpoints }, index): EdgeInsertResult<N, E> =>
        statuses[index] === 'collapsed'
          ? { status: 'collapsed', edge: null, endpoints }
          : {
              status: statuses[index] as 'added' | 'existing',
              edge: this.getEdge(endpoints)!,
              endpoints,
            },
    );
    return {
      results,
      added: statuses.filter((s) => s === 'added').length,
      existing: statuses.filter((s) => s === 'existing').length,
      collapsed: statuses.filter((s) => s === 'collapsed').length,
    };
  }

  /**
   * Insert an edge and missing endpoints; reports added/existing/collapsed.
   * @throws Before mutation for invalid inputs.
   */
  addEdge(endpoints: Segment2D, ...args: AttributeArgs<E>): EdgeInsertResult<N, E> {
    return this.guarded(
      () => this.insert([{ endpoints, attributes: (args[0] ?? {}) as E }]).results[0]!,
    );
  }

  /**
   * Atomic batch insertion; reports every input in order.
   * @throws Before mutation for invalid inputs.
   */
  addEdges(records: readonly EdgeRecord<E>[]): BatchInsertResult<N, E> {
    return this.guarded(() => this.insert(records));
  }

  /** Current edge by endpoints; null when absent. @throws For invalid coordinates/options. */
  getEdge(edge: EdgeInput<N, E>): SpatialEdge<N, E> | null {
    const key = this.edgeKey(edge);
    return key === undefined ? null : this.edgeSnapshot(key);
  }

  /**
   * Current edge between two positions; null when absent.
   * @throws For invalid coordinates/options.
   */
  getEdgeBetween(a: NodeInput<N>, b: NodeInput<N>): SpatialEdge<N, E> | null {
    return this.getEdge([this.pointOfInput(a), this.pointOfInput(b)]);
  }

  /**
   * Whether an edge exists between the canonical endpoints.
   * @throws For invalid coordinates/options.
   */
  hasEdge(edge: EdgeInput<N, E>): boolean {
    return this.edgeKey(edge) !== undefined;
  }

  /** Current edges in insertion order, sharing node snapshots within the result. */
  getEdges(): SpatialEdge<N, E>[] {
    const cache = new Map<string, SpatialNode<N>>();
    return this.#graph.edges().map((key) => this.edgeSnapshot(key, cache));
  }

  /** Current canonical edge geometry, without classification materialization. */
  getEdgeSegments(): Segment2D[] {
    return this.#graph
      .edges()
      .map((key) => Object.freeze(this.segment(key).map(freezePoint)) as unknown as Segment2D);
  }

  /**
   * Current midpoint without grid rounding; null when absent.
   * @throws For invalid coordinates/options.
   */
  getEdgeMidpoint(edge: EdgeInput<N, E>): Point2D | null {
    return this.getEdge(edge)?.midpoint ?? null;
  }

  /**
   * Current geometric length independent of metadata; null when absent.
   * @throws For invalid coordinates/options.
   */
  getEdgeLength(edge: EdgeInput<N, E>): number | null {
    const key = this.edgeKey(edge);
    return key === undefined ? null : distance(...this.segment(key));
  }

  /** Copied current edge metadata; null when absent. @throws For invalid coordinates/options. */
  getEdgeAttributes(edge: EdgeInput<N, E>): Readonly<E> | null {
    const key = this.edgeKey(edge);

    if (key === undefined) {
      return null;
    }

    const attributes = this.#graph.getEdgeAttributes(key).data;
    return Object.freeze(this.cloneEdge(attributes));
  }

  /** Merge into an existing edge; null when absent. @throws For invalid coordinates/options. */
  mergeEdgeAttributes(edge: EdgeInput<N, E>, attributes: Partial<E>): SpatialEdge<N, E> | null {
    return this.guarded(() => {
      const key = this.edgeKey(edge);

      if (key === undefined) {
        return null;
      }

      const data = this.cloneEdge({
        ...this.#graph.getEdgeAttributes(key).data,
        ...copyData(attributes),
      });
      this.snapshotEdgeCopy(data);
      for (const node of this.#graph.extremities(key)) {
        this.snapshotNodeCopy(this.#graph.getNodeAttributes(node).data);
      }
      this.#graph.replaceEdgeAttributes(key, { data });
      this.currentRevision++;
      return this.edgeSnapshot(key);
    });
  }

  /**
   * Remove an edge, leaving endpoints; false when absent.
   * @throws For invalid coordinates/options.
   */
  removeEdge(edge: EdgeInput<N, E>): boolean {
    return this.removeEdges([edge]) > 0;
  }

  /** Atomic removal; number of existing edges removed. @throws For invalid coordinates. */
  removeEdges(edges: readonly EdgeInput<N, E>[]): number {
    return this.guarded(() => {
      const plan = emptyPlan<N, E>();
      plan.removeEdges = [
        ...new Set(
          edges.map((edge) => this.edgeKey(edge)).filter((key): key is string => key !== undefined),
        ),
      ];
      this.apply(plan);
      return plan.removeEdges.length;
    });
  }

  /** Clear all nodes and edges; graph metadata and coordinate policy remain. */
  clear(): void {
    this.guarded(() => {
      if (this.nodeCount) {
        this.#graph.clear();
        this.#nodeIndex.clear();
        this.#edgeIndex.clear();
        this.currentRevision++;
      }
    });
  }

  /**
   * Move simultaneously, removing/recreating positions.
   * @throws Before mutation for missing sources or conflicting destinations.
   */
  moveNodes(
    moves: readonly (readonly [NodeInput<N>, Point2D])[],
    options: ConflictOptions<N, E> = {},
  ): MutationReport {
    return this.guarded(() => {
      const destinations = new Map<string, Point2D>();

      for (const [source, target] of moves) {
        const key = this.keyOf(source);
        const point = this.canonical(target);

        if (!this.#graph.hasNode(key)) {
          throw new Error('Move source does not exist; addNode first or check hasNode.');
        }

        const previous = destinations.get(key);

        if (previous && pointKey(previous) !== pointKey(point)) {
          throw new Error('One source has conflicting destinations; provide one target per node.');
        }
        destinations.set(key, point);
      }
      for (const [key, point] of destinations) {
        if (key === pointKey(point)) {
          destinations.delete(key);
        }
      }

      const { plan, report } = planMoves(this.#graph, destinations, options);
      this.apply(plan);
      return report;
    });
  }

  /** Move one node; coordinates define identity. @throws If source is missing or input invalid. */
  moveNode(
    node: NodeInput<N>,
    target: Point2D,
    options: ConflictOptions<N, E> = {},
  ): MutationReport {
    return this.moveNodes([[node, target]], options);
  }

  /** Merge source into target using the move conflict policy. @throws If source is missing. */
  mergeNodeInto(
    source: NodeInput<N>,
    target: NodeInput<N>,
    options: ConflictOptions<N, E> = {},
  ): MutationReport {
    return this.moveNode(source, this.pointOfInput(target), options);
  }

  /**
   * Split only on the exact and canonical segment; missing/endpoint splits are no-ops.
   * @throws For off-edge points or invalid callback data before mutation.
   */
  splitEdge(
    input: EdgeInput<N, E>,
    point: Point2D,
    options: SplitOptions<N, E> = {},
  ): SplitResult<N, E> {
    return this.guarded(() => {
      canonicalPoint(point, null);
      const key = this.edgeKey(input);

      if (key === undefined) {
        return { changed: false, reason: 'missing', node: null, removed: null, edges: [] };
      }

      const segment = this.segment(key);
      const canonical = this.canonical(point);
      const nodeKey = pointKey(canonical);

      if (
        projectPoint(point, segment).distance > this.positionTolerance ||
        projectPoint(canonical, segment).distance > this.positionTolerance
      ) {
        throw new Error(
          'Split point is off the edge or moves off it after quantization; use an on-edge point or adjust precision/positionTolerance.',
        );
      }

      const edge = this.edgeSnapshot(key);

      if (this.#graph.extremities(key).includes(nodeKey)) {
        return {
          changed: false,
          reason: 'endpoint',
          node: this.nodeSnapshot(nodeKey),
          removed: null,
          edges: [edge],
        };
      }

      const plan = emptyPlan<N, E>();
      plan.removeEdges = [key];
      if (!this.#graph.hasNode(nodeKey)) {
        plan.nodes.set(nodeKey, { x: canonical[0], y: canonical[1], data: this.newNodeData() });
      }

      const parts: Segment2D[] = [
        [segment[0], canonical],
        [canonical, segment[1]],
      ];
      parts.forEach((endpoints, index) => {
        validateSegment(endpoints);
        const [source, target] = endpoints.map(pointKey) as [string, string];
        const existing =
          this.#graph.hasNode(source) && this.#graph.hasNode(target)
            ? this.#graph.edge(source, target)
            : undefined;
        const data = this.cloneEdge(
          options.splitAttributes
            ? options.splitAttributes(edge, endpoints, index as 0 | 1)
            : this.#graph.getEdgeAttributes(key).data,
        );
        plan.edges.push({
          key: existing,
          source,
          target,
          data:
            existing === undefined
              ? data
              : mergeData(
                  this.#graph.getEdgeAttributes(existing).data,
                  data,
                  options.mergeEdgeAttributes,
                ),
        });
      });
      this.apply(plan);
      return {
        changed: true,
        node: this.nodeSnapshot(nodeKey),
        removed: edge,
        edges: parts.map((part) => this.getEdge(part)!),
      };
    });
  }

  private join(
    node: NodeInput<N>,
    options: JoinOptions<N, E>,
    allowBend: boolean,
  ): JoinResult<N, E> {
    const key = this.keyOf(node);

    if (!this.#graph.hasNode(key)) {
      return { changed: false, reason: 'missing', edge: null };
    }
    if (this.#graph.degree(key) !== 2) {
      return { changed: false, reason: 'degree', edge: null };
    }
    if (!allowBend && this.nodeSnapshot(key).type !== 'intermediate') {
      return { changed: false, reason: 'bend', edge: null };
    }

    const [a, b] = this.#graph.neighbors(key) as [string, string];

    if (!allowBend && this.#graph.hasEdge(a, b)) {
      return {
        changed: false,
        reason: 'connected',
        edge: this.edgeSnapshot(this.#graph.edge(a, b)!),
      };
    }

    const incident = this.#graph
      .edges(key)
      .sort((x, y) =>
        compareKeys(pairKey(...this.#graph.extremities(x)), pairKey(...this.#graph.extremities(y))),
      );
    const [first, second] = incident.map((edge) => this.edgeSnapshot(edge)) as [
      SpatialEdge<N, E>,
      SpatialEdge<N, E>,
    ];
    const data = this.cloneEdge(
      options.joinAttributes
        ? options.joinAttributes(first, second)
        : mergeData(first.attributes as E, second.attributes as E),
    );
    validateSegment([
      pointOf(this.#graph.getNodeAttributes(a)),
      pointOf(this.#graph.getNodeAttributes(b)),
    ]);
    const existing = this.#graph.edge(a, b);
    const plan = emptyPlan<N, E>();
    plan.removeNodes = [key];
    plan.edges.push({
      key: existing,
      source: a,
      target: b,
      data:
        existing === undefined
          ? data
          : mergeData(this.#graph.getEdgeAttributes(existing).data, data),
    });
    this.apply(plan);
    return {
      changed: true,
      edge: this.getEdgeBetween(
        pointOf(this.#graph.getNodeAttributes(a)),
        pointOf(this.#graph.getNodeAttributes(b)),
      ),
    };
  }

  /**
   * Join a straight degree-2 node; reports why unsafe joins are skipped.
   * @throws For invalid coordinates/options.
   */
  joinNode(node: NodeInput<N>, options: JoinOptions<N, E> = {}): JoinResult<N, E> {
    return this.guarded(() => this.join(node, options, false));
  }

  /**
   * Explicitly replace a degree-2 bend/triangle by a direct neighbor edge.
   * @throws For invalid coordinates/options.
   */
  collapseDegree2Node(node: NodeInput<N>, options: JoinOptions<N, E> = {}): JoinResult<N, E> {
    return this.guarded(() => this.join(node, options, true));
  }

  /**
   * Indexed exact nearest node; null for an empty graph. Pass scan to compare the reference
   * algorithm.
   * @throws For invalid coordinates/options.
   */
  findNearestNode(
    point: Point2D,
    options: {
      scan?: boolean;
    } = {},
  ): SpatialNode<N> | null {
    canonicalPoint(point, null);

    const evaluate = (key: string) => distance(point, pointOf(this.#graph.getNodeAttributes(key)));

    const key = options.scan
      ? nearestKey(this.#graph.nodes(), evaluate)
      : this.#nodeIndex.nearest(point, evaluate);
    return key === null ? null : this.nodeSnapshot(key);
  }

  /**
   * Indexed exact nearest segment/projection; null for no edges. Geometry is never snapped to the
   * grid.
   * @throws For invalid coordinates/options.
   */
  findNearestEdge(
    point: Point2D,
    options: {
      scan?: boolean;
    } = {},
  ): NearestEdgeResult<N, E> | null {
    canonicalPoint(point, null);

    const evaluate = (key: string) => projectPoint(point, this.segment(key)).distance;

    const key = options.scan
      ? nearestKey(this.#graph.edges(), evaluate)
      : this.#edgeIndex.nearest(point, evaluate);
    if (key === null) {
      return null;
    }

    const projection = projectPoint(point, this.segment(key));
    return { edge: this.edgeSnapshot(key), ...projection, point: freezePoint(projection.point) };
  }

  /** Graphology DFS component snapshots, including isolated nodes; [] for an empty graph. */
  getConnectedComponents(): SpatialNode<N>[][] {
    return connectedComponents(this.#graph).map((keys) =>
      keys.map((key) => this.nodeSnapshot(key)),
    );
  }

  private traversalVisitor(callback: TraversalCallback<N>) {
    if (typeof callback !== 'function') {
      throw new TypeError('Traversal callback must be a function; pass (node, depth) => { ... }.');
    }

    return (key: string, _attributes: StoredNode<N>, depth: number) =>
      callback(this.nodeSnapshot(key), depth);
  }

  /**
   * Graphology BFS over all nodes, including isolated nodes; no visits for an empty graph.
   * Depth resets to zero at each traversal root. Returning true skips this node's expansion.
   * @throws For an invalid callback, callback failure, or mutation/nested traversal in callbacks.
   */
  bfs(callback: TraversalCallback<N>): void {
    this.guarded(() => graphologyBfs(this.#graph, this.traversalVisitor(callback)));
  }

  /**
   * Graphology BFS from a node at depth zero; no visits when the start node is missing.
   * Depth counts hops from the start. Returning true skips this node's expansion.
   * @throws For invalid coordinates/callbacks, callback failure, or mutation/nested traversal in callbacks.
   */
  bfsFromNode(node: NodeInput<N>, callback: TraversalCallback<N>): void {
    this.guarded(() => {
      const visit = this.traversalVisitor(callback);
      const key = this.keyOf(node);

      if (this.#graph.hasNode(key)) {
        graphologyBfsFromNode(this.#graph, key, visit);
      }
    });
  }

  /**
   * Graphology DFS over all nodes, including isolated nodes; no visits for an empty graph.
   * Depth is discovery depth, reset at each root. Returning true skips this node's expansion.
   * @throws For an invalid callback, callback failure, or mutation/nested traversal in callbacks.
   */
  dfs(callback: TraversalCallback<N>): void {
    this.guarded(() => graphologyDfs(this.#graph, this.traversalVisitor(callback)));
  }

  /**
   * Graphology DFS from a node at depth zero; no visits when the start node is missing.
   * Depth is discovery depth, not minimum hops. Returning true skips this node's expansion.
   * @throws For invalid coordinates/callbacks, callback failure, or mutation/nested traversal in callbacks.
   */
  dfsFromNode(node: NodeInput<N>, callback: TraversalCallback<N>): void {
    this.guarded(() => {
      const visit = this.traversalVisitor(callback);
      const key = this.keyOf(node);

      if (this.#graph.hasNode(key)) {
        graphologyDfsFromNode(this.#graph, key, visit);
      }
    });
  }

  private path(
    nodes: readonly string[],
    edges: readonly string[],
    cost?: number,
  ): SpatialPath<N, E> {
    const cache = new Map<string, SpatialNode<N>>();
    const snapshots = edges.map((key) => this.edgeSnapshot(key, cache));
    const length = snapshots.reduce((sum, edge) => sum + edge.length, 0);
    return {
      nodes: nodes.map((key) => this.nodeSnapshot(key, cache)),
      edges: snapshots,
      length,
      cost: cost ?? length,
      closed: nodes.length > 1 && nodes[0] === nodes.at(-1),
    };
  }

  /** Maximal chains and cycles covering each edge exactly once. */
  findPaths(): SpatialPath<N, E>[] {
    return decompose(this.#graph).map((path) => this.path(path.nodes, path.edges));
  }

  /**
   * Edge-once chains/cycles within an induced subset; degrees are measured within it.
   * @throws For invalid coordinates/options.
   */
  findTerminalPaths(subset?: readonly NodeInput<N>[]): SpatialPath<N, E>[] {
    const keys = subset && new Set(subset.map((node) => this.keyOf(node)));
    return decompose(this.#graph, keys).map((path) => this.path(path.nodes, path.edges));
  }

  /**
   * Graphology Dijkstra or reopening A*. Missing/disconnected endpoints return null.
   * Uses private adjacency directly unless null-cost edges require a filtered copy.
   * @throws For invalid costs/heuristics, overflowing total cost or mutation from callbacks.
   */
  getShortestPath(
    a: NodeInput<N>,
    b: NodeInput<N>,
    options: PathOptions<N, E> = {},
  ): SpatialPath<N, E> | null {
    return this.guarded(() => {
      const start = this.keyOf(a);
      const goal = this.keyOf(b);
      const algorithm = options.algorithm ?? PathAlgorithm.Dijkstra;

      if (!this.#graph.hasNode(start) || !this.#graph.hasNode(goal)) {
        return null;
      }
      if (algorithm !== PathAlgorithm.Dijkstra && algorithm !== PathAlgorithm.AStar) {
        throw new Error('Unknown algorithm; choose PathAlgorithm.Dijkstra or PathAlgorithm.AStar.');
      }
      if (options.heuristic && algorithm !== PathAlgorithm.AStar) {
        throw new Error('A heuristic requires algorithm: PathAlgorithm.AStar.');
      }

      const costs = new Map<string, number | null>();

      for (const key of this.#graph.edges()) {
        const cost = options.cost
          ? options.cost(this.edgeSnapshot(key))
          : distance(...this.segment(key));
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
          throw new RangeError(
            'Edge cost must be finite and nonnegative, or null to close an edge.',
          );
        }
        costs.set(key, cost);
      }

      const heuristics = new Map<string, number>();
      const goalNode = this.nodeSnapshot(goal);

      for (const key of this.#graph.nodes()) {
        let heuristic = 0;

        if (algorithm === PathAlgorithm.AStar) {
          if (options.heuristic) {
            heuristic = options.heuristic(this.nodeSnapshot(key), goalNode);
          } else if (!options.cost) {
            heuristic = distance(pointOf(this.#graph.getNodeAttributes(key)), goalNode.point);
          }
        }

        if (!Number.isFinite(heuristic) || heuristic < 0 || (key === goal && heuristic !== 0)) {
          throw new RangeError(
            'Heuristic must be finite, nonnegative, and zero at the destination.',
          );
        }
        heuristics.set(key, heuristic);
      }

      const result = shortestPath(this.#graph, start, goal, costs, algorithm, heuristics);
      return result && this.path(result.nodes, result.edges, result.cost);
    });
  }

  /**
   * Length of a valid graph walk; null when a node/edge is absent, zero for an empty walk.
   * @throws For invalid coordinates/options.
   */
  getPathLength(nodes: readonly NodeInput<N>[]): number | null {
    const keys = nodes.map((node) => this.keyOf(node));

    if (keys.some((key) => !this.#graph.hasNode(key))) {
      return null;
    }

    let length = 0;

    for (let i = 1; i < keys.length; i++) {
      if (keys[i] === keys[i - 1]) {
        continue;
      }

      const edge = this.#graph.edge(keys[i - 1], keys[i]);

      if (edge === undefined) {
        return null;
      }
      length += distance(...this.segment(edge));
    }

    return length;
  }

  /** Longest edge in a snapshot path; null for no edges. */
  getLongestEdge(path: SpatialPath<N, E>): SpatialEdge<N, E> | null {
    return path.edges.reduce<SpatialEdge<N, E> | null>(
      (winner, edge) => (!winner || edge.length > winner.length ? edge : winner),
      null,
    );
  }

  /**
   * Whether any incident directions are orthogonal within tolerance; false when missing.
   * @throws For invalid tolerance.
   */
  hasOrthogonalEdges(node: NodeInput<N>, tolerance = 1e-7): boolean {
    validateAngle(tolerance);
    const current = this.getNode(node);

    if (!current) {
      return false;
    }

    const neighbors = this.getNeighbors(current);
    return neighbors.some((a, i) =>
      neighbors
        .slice(i + 1)
        .some(
          (b) =>
            Math.abs(
              angleDegrees(vector(current.point, a.point), vector(current.point, b.point)) - 90,
            ) <= tolerance,
        ),
    );
  }

  /** Current nodes with orthogonal incident directions. */
  getNodesWithOrthogonalEdges(tolerance = 1e-7): SpatialNode<N>[] {
    validateAngle(tolerance);
    return this.getNodes().filter((node) => this.hasOrthogonalEdges(node, tolerance));
  }

  /**
   * Neighbors ordered by counterclockwise turn from a direction vector; [] when missing.
   * @throws For invalid/zero direction.
   */
  getNeighborsByLeftTurn(node: NodeInput<N>, incoming: Vector2D): SpatialNode<N>[] {
    canonicalPoint(incoming, null);
    if (Math.hypot(...incoming) === 0) {
      throw new Error('Incoming direction must be nonzero; pass a direction vector.');
    }

    const center = this.getNode(node);

    if (!center) {
      return [];
    }

    const heading = Math.atan2(incoming[1], incoming[0]);

    const turn = (neighbor: SpatialNode<N>) => {
      const v = vector(center.point, neighbor.point);
      return (Math.atan2(v[1], v[0]) - heading + 2 * Math.PI) % (2 * Math.PI);
    };

    return this.getNeighbors(center).sort((a, b) => turn(a) - turn(b));
  }

  /**
   * Nonmutating geometric route between nearest projections; null if empty, disconnected, or beyond
   * maxSnapDistance. Searches a temporary Graphology copy with exact projection nodes.
   * @throws For invalid coordinates/options.
   */
  route(
    fromPoint: Point2D,
    toPoint: Point2D,
    options: {
      maxSnapDistance?: number;
    } = {},
  ): RouteResult<N, E> | null {
    return this.guarded(() => {
      const maximum = options.maxSnapDistance ?? Infinity;

      if (Number.isNaN(maximum) || maximum < 0) {
        throw new RangeError('maxSnapDistance must be nonnegative.');
      }

      const from = this.findNearestEdge(fromPoint);
      const to = this.findNearestEdge(toPoint);

      if (!from || !to || from.distance > maximum || to.distance > maximum) {
        return null;
      }

      const query = this.#graph.copy();
      const costs = new Map(query.edges().map((key) => [key, distance(...this.segment(key))]));
      const virtualEdgeAttributes = query.getEdgeAttributes(from.edge.key);

      const link = (a: string, b: string, cost: number): void => {
        const existing = query.edge(a, b);
        const key = existing ?? query.addUndirectedEdge(a, b, virtualEdgeAttributes);
        costs.set(key, Math.min(cost, costs.get(key) ?? Infinity));
      };

      const attach = (projection: NearestEdgeResult<N, E>, virtual: string): string => {
        const edge = projection.edge;

        if (projection.t === 0) {
          return edge.source.key;
        }
        if (projection.t === 1) {
          return edge.target.key;
        }

        const source = query.getNodeAttributes(edge.source.key);
        query.addNode(virtual, { ...source, x: projection.point[0], y: projection.point[1] });
        link(virtual, edge.source.key, projection.t * edge.length);
        link(virtual, edge.target.key, (1 - projection.t) * edge.length);
        return virtual;
      };

      const start = attach(from, VIRTUAL_SOURCE_KEY);
      const goal = attach(to, VIRTUAL_TARGET_KEY);

      if (from.edge.equals(to.edge) && start !== goal) {
        link(start, goal, distance(from.point, to.point));
      }

      const result = shortestPath(query, start, goal, costs);

      if (!result) {
        return null;
      }

      return {
        from,
        to,
        points: Object.freeze(
          result.nodes.map((key) => freezePoint(pointOf(query.getNodeAttributes(key)))),
        ),
        length: result.cost,
        cost: result.cost,
      };
    });
  }

  /**
   * Split crossings/T-junctions and overlaps atomically. Unrepresentable grid intersections return
   * unresolved points without mutation.
   * Candidate bounds include positionTolerance; geometry is checked before planning cuts.
   */
  planarize(options: ConflictOptions<N, E> = {}): PlanarizeResult {
    return this.guarded(() => {
      const keys = this.#graph.edges();
      const cuts = new Map(keys.map((key) => [key, [...this.segment(key)] as Point2D[]]));
      const unresolved: Point2D[] = [];
      const seen = new Set<string>();
      const intersectionPoints = new Set<string>();
      let overlaps = 0;

      for (const first of keys) {
        for (const second of this.#edgeIndex.search(
          bounds(this.segment(first), this.positionTolerance),
        )) {
          if (first === second) {
            continue;
          }

          const pair = pairKey(first, second);

          if (seen.has(pair)) {
            continue;
          }
          seen.add(pair);
          const result = intersectSegments(
            this.segment(first),
            this.segment(second),
            this.positionTolerance,
          );
          if (result.type === 'none') {
            continue;
          }
          if (result.type === 'overlap') {
            overlaps++;
          }
          for (const point of result.type === 'point' ? [result.point] : result.endpoints) {
            const canonical = this.canonical(point);

            if (
              [first, second].some(
                (key) =>
                  projectPoint(canonical, this.segment(key)).distance > this.positionTolerance,
              )
            ) {
              unresolved.push(freezePoint(point));
              continue;
            }
            intersectionPoints.add(pointKey(canonical));
            cuts.get(first)!.push(canonical);
            cuts.get(second)!.push(canonical);
          }
        }
      }
      if (unresolved.length) {
        return { changed: false, intersections: intersectionPoints.size, overlaps, unresolved };
      }
      for (const key of keys) {
        const unique = new Map(cuts.get(key)!.map((point) => [pointKey(point), point]));
        cuts.set(
          key,
          [...unique.values()].sort(
            (a, b) => projectPoint(a, this.segment(key)).t - projectPoint(b, this.segment(key)).t,
          ),
        );
      }
      if (![...cuts.values()].some((points) => points.length > 2) && !overlaps) {
        return {
          changed: false,
          intersections: intersectionPoints.size,
          overlaps: 0,
          unresolved: [],
        };
      }

      const plan = emptyPlan<N, E>();
      plan.removeEdges = keys;
      const pieces = new Map<
        string,
        {
          key?: string;
          source: string;
          target: string;
          data: E;
        }
      >();
      for (const key of keys.sort((a, b) =>
        compareKeys(pairKey(...this.#graph.extremities(a)), pairKey(...this.#graph.extremities(b))),
      )) {
        const points = cuts.get(key)!;

        for (const point of points) {
          const node = pointKey(point);

          if (!this.#graph.hasNode(node) && !plan.nodes.has(node)) {
            plan.nodes.set(node, { x: point[0], y: point[1], data: this.newNodeData() });
          }
        }
        for (let i = 1; i < points.length; i++) {
          const source = pointKey(points[i - 1]!);
          const target = pointKey(points[i]!);

          if (source === target) {
            continue;
          }
          validateSegment([points[i - 1]!, points[i]!]);
          const pair = pairKey(source, target);
          const winner = pieces.get(pair);
          const data = this.cloneEdge(this.#graph.getEdgeAttributes(key).data);
          pieces.set(
            pair,
            winner
              ? { ...winner, data: mergeData(winner.data, data, options.mergeEdgeAttributes) }
              : { key: points.length === 2 ? key : undefined, source, target, data },
          );
        }
      }
      plan.edges = [...pieces.values()];
      this.apply(plan);
      return { changed: true, intersections: intersectionPoints.size, overlaps, unresolved: [] };
    });
  }

  /**
   * Merge transitive within-tolerance clusters into the smallest canonical key; displacement may
   * exceed tolerance.
   */
  mergeNearbyNodes(tolerance: number, options: ConflictOptions<N, E> = {}): NearbyMergeResult {
    return this.guarded(() => {
      validateTolerance(tolerance);
      const keys = this.#graph.nodes();
      const parent = new Map(keys.map((key) => [key, key]));

      const root = (key: string): string => {
        let cursor = key;

        while (parent.get(cursor) !== cursor) {
          cursor = parent.get(cursor)!;
        }

        return cursor;
      };

      for (const key of keys) {
        const p = pointOf(this.#graph.getNodeAttributes(key));

        for (const other of this.#nodeIndex.search({
          minX: p[0] - tolerance,
          minY: p[1] - tolerance,
          maxX: p[0] + tolerance,
          maxY: p[1] + tolerance,
        })) {
          if (distance(p, pointOf(this.#graph.getNodeAttributes(other))) <= tolerance) {
            const a = root(key);
            const b = root(other);
            parent.set(a < b ? b : a, a < b ? a : b);
          }
        }
      }

      const groups = new Map<string, string[]>();

      for (const key of keys) {
        const representative = root(key);
        const group = groups.get(representative) ?? [];
        group.push(key);
        groups.set(representative, group);
      }

      const clusters = [...groups.values()]
        .filter((group) => group.length > 1)
        .map((group) => group.sort());
      const moves = new Map<string, Point2D>();
      let maxDisplacement = 0;

      for (const group of clusters) {
        const point = pointOf(this.#graph.getNodeAttributes(group[0]!));

        for (const key of group.slice(1)) {
          moves.set(key, point);
          maxDisplacement = Math.max(
            maxDisplacement,
            distance(point, pointOf(this.#graph.getNodeAttributes(key))),
          );
        }
      }

      const { plan, report } = planMoves(this.#graph, moves, options);
      this.apply(plan);
      return { ...report, clusters, maxDisplacement };
    });
  }

  /** Copied graph metadata; nested values follow the shallow-copy convention. */
  getGraphAttributes(): Readonly<Record<string, unknown>> {
    return Object.freeze(copyData(this.#graph.getAttributes()));
  }

  /** A graph metadata value; undefined when absent. */
  getGraphAttribute(name: string): unknown {
    return this.#graph.getAttribute(name);
  }

  /** Set graph metadata, preserving spatial storage invariants. */
  setGraphAttribute(name: string, value: unknown): void {
    this.guarded(() => {
      this.#graph.replaceAttributes({ ...this.#graph.getAttributes(), [name]: value });
      this.currentRevision++;
    });
  }

  /** Replace graph metadata with a copied dictionary. */
  replaceGraphAttributes(attributes: Record<string, unknown>): void {
    this.guarded(() => {
      this.#graph.replaceAttributes(copyData(attributes));
      this.currentRevision++;
    });
  }

  /** String label, or null for a missing/unlabeled node. */
  getNodeLabel(node: NodeInput<N>): string | null {
    const label = (this.getNodeAttributes(node) as Record<string, unknown> | null)?.label;
    return typeof label === 'string' ? label : null;
  }

  /** Set/remove a label on an existing node; false when absent. */
  setNodeLabel(node: NodeInput<N>, label: LabelInput<N>): boolean {
    return this.guarded(() => {
      const key = this.keyOf(node);

      if (!this.#graph.hasNode(key)) {
        return false;
      }
      if (label !== null && typeof label !== 'string') {
        throw new TypeError('Label must be a string or null to remove it.');
      }

      const record = this.#graph.getNodeAttributes(key);
      const data = this.cloneNode(record.data) as N & {
        label?: string;
      };
      if (label === null) {
        delete data.label;
      } else {
        data.label = label;
      }
      this.#graph.replaceNodeAttributes(key, { ...record, data });
      this.currentRevision++;
      return true;
    });
  }

  /** String label, or null for a missing/unlabeled edge. */
  getEdgeLabel(edge: EdgeInput<N, E>): string | null {
    const label = (this.getEdgeAttributes(edge) as Record<string, unknown> | null)?.label;
    return typeof label === 'string' ? label : null;
  }

  /** Set/remove an existing edge's label; false when absent. */
  setEdgeLabel(edge: EdgeInput<N, E>, label: LabelInput<E>): boolean {
    return this.guarded(() => {
      const key = this.edgeKey(edge);

      if (key === undefined) {
        return false;
      }
      if (label !== null && typeof label !== 'string') {
        throw new TypeError('Label must be a string or null to remove it.');
      }

      const data = this.cloneEdge(this.#graph.getEdgeAttributes(key).data) as E & {
        label?: string;
      };
      if (label === null) {
        delete data.label;
      } else {
        data.label = label;
      }
      this.#graph.replaceEdgeAttributes(key, { data });
      this.currentRevision++;
      return true;
    });
  }

  private emptyGraph(): SpatialGraph<N, E> {
    return new SpatialGraph<N, E>(...([this.config] as ConstructorArgs<N, E>));
  }

  private cloneGraph(mode: 'all' | 'nodes' | 'none'): SpatialGraph<N, E> {
    const graph = this.emptyGraph();
    const plan = emptyPlan<N, E>();
    graph.#graph.replaceAttributes(copyData(this.#graph.getAttributes()));
    if (mode !== 'none') {
      for (const key of this.#graph.nodes()) {
        const record = this.#graph.getNodeAttributes(key);
        plan.nodes.set(key, { ...record, data: this.cloneNode(record.data) });
      }
    }
    if (mode === 'all') {
      for (const key of this.#graph.edges()) {
        const [source, target] = this.#graph.extremities(key);
        plan.edges.push({
          key,
          source,
          target,
          data: this.cloneEdge(this.#graph.getEdgeAttributes(key).data),
        });
      }
    }
    graph.apply(plan);
    return graph;
  }

  /** Independent graph with the same options/metadata but no nodes or edges. */
  nullCopy(): SpatialGraph<N, E> {
    return this.guarded(() => this.cloneGraph('none'));
  }

  /** Independent graph containing the nodes/options/metadata, without edges. */
  emptyCopy(): SpatialGraph<N, E> {
    return this.guarded(() => this.cloneGraph('nodes'));
  }

  /**
   * Independent graph preserving keys, options and metadata (shallow unless clone hooks are
   * configured).
   */
  copy(): SpatialGraph<N, E> {
    return this.guarded(() => this.cloneGraph('all'));
  }

  /** Edge-filtered subgraph preserving metadata/policy; optionally retain isolated nodes. */
  getSubgraph(
    predicate: (edge: SpatialEdge<N, E>) => boolean,
    options: {
      includeIsolated?: boolean;
    } = {},
  ): SpatialGraph<N, E> {
    return this.guarded(() => {
      const graph = this.cloneGraph('none');
      const plan = emptyPlan<N, E>();

      for (const key of this.#graph.edges()) {
        if (predicate(this.edgeSnapshot(key))) {
          const [source, target] = this.#graph.extremities(key);

          for (const node of [source, target]) {
            const record = this.#graph.getNodeAttributes(node);
            plan.nodes.set(node, { ...record, data: this.cloneNode(record.data) });
          }
          plan.edges.push({
            key,
            source,
            target,
            data: this.cloneEdge(this.#graph.getEdgeAttributes(key).data),
          });
        }
      }
      if (options.includeIsolated) {
        for (const key of this.#graph.nodes()) {
          if (this.#graph.degree(key) === 0) {
            const record = this.#graph.getNodeAttributes(key);
            plan.nodes.set(key, { ...record, data: this.cloneNode(record.data) });
          }
        }
      }
      graph.apply(plan);
      return graph;
    });
  }

  /**
   * Merge another graph; existing metadata wins.
   * @throws For differing policies unless renormalize is explicit.
   */
  union(
    other: SpatialGraph<N, E>,
    options: ConflictOptions<N, E> & {
      renormalize?: boolean;
    } = {},
  ): MutationReport {
    return this.guarded(() => this.mergeGraph(other, options));
  }

  private mergeGraph(
    other: SpatialGraph<N, E>,
    options: ConflictOptions<N, E> & {
      renormalize?: boolean;
    },
  ): MutationReport {
    if (
      !options.renormalize &&
      (other.coordinatePrecision !== this.coordinatePrecision ||
        other.positionTolerance !== this.positionTolerance ||
        other.straightAngleToleranceDeg !== this.straightAngleToleranceDeg)
    ) {
      throw new Error(
        'Graph policies differ; use matching options or union(other, {renormalize: true}).',
      );
    }

    const plan = emptyPlan<N, E>();
    const report: MutationReport = {
      changed: false,
      moved: [],
      mergedNodes: 0,
      collapsedEdges: 0,
      mergedEdges: 0,
    };
    for (const node of other.getNodes().sort((a, b) => compareKeys(a.key, b.key))) {
      const point = this.canonical(node.point);
      const key = pointKey(point);
      const incoming = this.cloneNode(node.attributes as N);
      const winner =
        plan.nodes.get(key) ??
        (this.#graph.hasNode(key) ? this.#graph.getNodeAttributes(key) : undefined);
      plan.nodes.set(key, {
        x: point[0],
        y: point[1],
        data: winner ? mergeData(winner.data, incoming, options.mergeNodeAttributes) : incoming,
      });
      if (winner) {
        report.mergedNodes++;
      }
    }

    const edges = new Map<
      string,
      {
        key?: string;
        source: string;
        target: string;
        data: E;
      }
    >();
    for (const edge of other
      .getEdges()
      .sort((a, b) =>
        compareKeys(pairKey(a.source.key, a.target.key), pairKey(b.source.key, b.target.key)),
      )) {
      const [source, target] = edge.endpoints.map((point) => this.getNodeKey(point)) as [
        string,
        string,
      ];
      if (source === target) {
        report.collapsedEdges++;
        continue;
      }
      validateSegment([pointOf(plan.nodes.get(source)!), pointOf(plan.nodes.get(target)!)]);
      const pair = pairKey(source, target);
      const incoming = this.cloneEdge(edge.attributes as E);
      const existing =
        this.#graph.hasNode(source) && this.#graph.hasNode(target)
          ? this.#graph.edge(source, target)
          : undefined;
      const winner =
        edges.get(pair) ??
        (existing === undefined
          ? undefined
          : { key: existing, source, target, data: this.#graph.getEdgeAttributes(existing).data });
      edges.set(
        pair,
        winner
          ? { ...winner, data: mergeData(winner.data, incoming, options.mergeEdgeAttributes) }
          : { source, target, data: incoming },
      );
      if (winner) {
        report.mergedEdges++;
      }
    }

    const currentAttributes = this.#graph.getAttributes();
    const attributes = {
      ...copyData(other.#graph.getAttributes()),
      ...copyData(currentAttributes),
    };
    const metadataChanged = Object.keys(attributes).some(
      (key) => !Object.hasOwn(currentAttributes, key),
    );
    plan.edges = [...edges.values()];
    this.apply(plan);
    this.#graph.replaceAttributes(attributes);
    report.changed = plan.nodes.size > 0 || plan.edges.length > 0 || metadataChanged;
    if (metadataChanged && !plan.nodes.size && !plan.edges.length) {
      this.currentRevision++;
    }

    return report;
  }

  /** Versioned spatial envelope. Metadata must be JSON-compatible for lossless JSON.stringify. */
  export(): SpatialGraphJSON<N, E> {
    return {
      schema: 'spatial-graph',
      version: 2,
      options: {
        coordinatePrecision: this.coordinatePrecision,
        positionTolerance: this.positionTolerance,
        straightAngleToleranceDeg: this.straightAngleToleranceDeg,
      },
      attributes: copyData(this.#graph.getAttributes()),
      nodes: this.#graph.nodes().map((key) => ({
        key,
        point: freezePoint(pointOf(this.#graph.getNodeAttributes(key))),
        attributes: this.cloneNode(this.#graph.getNodeAttributes(key).data),
      })),
      edges: this.#graph.edges().map((key) => ({
        key,
        source: this.#graph.source(key),
        target: this.#graph.target(key),
        attributes: this.cloneEdge(this.#graph.getEdgeAttributes(key).data),
      })),
    };
  }

  /**
   * Replace or merge a fully validated spatial envelope.
   * @throws Before mutation for invalid data/policy.
   */
  import(
    data: unknown,
    options: {
      merge?: boolean;
    } = {},
  ): void {
    this.guarded(() => {
      const decoded = decodeGraphJSON<N, E>(data);

      if (
        decoded.options.coordinatePrecision !== this.coordinatePrecision ||
        decoded.options.positionTolerance !== this.positionTolerance ||
        decoded.options.straightAngleToleranceDeg !== this.straightAngleToleranceDeg
      ) {
        throw new Error(
          'Serialized policy differs; use SpatialGraph.fromJSON to restore its policy.',
        );
      }

      const incoming = this.emptyGraph();
      incoming.load(decoded);
      if (options.merge) {
        this.mergeGraph(incoming, {});
        return;
      }
      this.#graph = incoming.#graph;
      this.#nodeIndex = incoming.#nodeIndex;
      this.#edgeIndex = incoming.#edgeIndex;
      this.currentRevision++;
    });
  }

  private load(data: SpatialGraphJSON<N, E>): void {
    const plan = emptyPlan<N, E>();

    for (const node of data.nodes) {
      plan.nodes.set(node.key, {
        x: node.point[0],
        y: node.point[1],
        data: this.cloneNode(node.attributes),
      });
    }
    for (const edge of data.edges) {
      plan.edges.push({
        key: edge.key,
        source: edge.source,
        target: edge.target,
        data: this.cloneEdge(edge.attributes),
      });
    }
    this.apply(plan);
    this.#graph.replaceAttributes(copyData(data.attributes));
  }

  /**
   * Restore a validated detached graph with its serialized coordinate policy.
   * Metadata types default to NodeAttributes/EdgeAttributes; specify custom types explicitly.
   */
  static fromJSON<N extends object = NodeAttributes, E extends object = EdgeAttributes>(
    data: unknown,
    ...args: ConstructorArgs<NoInfer<N>, NoInfer<E>>
  ): SpatialGraph<N, E> {
    const decoded = decodeGraphJSON<N, E>(data);
    const graph = new SpatialGraph<N, E>(
      ...([{ ...args[0], ...decoded.options }] as ConstructorArgs<N, E>),
    );
    graph.load(decoded);
    return graph;
  }

  /**
   * Import a legacy coordinate-keyed Graphology export with explicit precision; preserves user
   * weight as data.
   */
  static fromLegacyJSON(
    data: unknown,
    options: {
      coordinatePrecision: number | null;
      positionTolerance?: number;
    },
  ) {
    const decoded = decodeLegacyJSON(data, options);
    return { graph: SpatialGraph.fromJSON(decoded.data), report: decoded.report };
  }

  /** Detached Graphology graph with top-level geometry and nested data. */
  toGraphology(): AbstractGraph<
    {
      x: number;
      y: number;
      data: N;
    },
    {
      length: number;
      data: E;
    }
  > {
    return detachedGraphology(this.#graph, this.cloneNode, this.cloneEdge);
  }

  /**
   * Validate/import a detached Graphology adapter. Directed, multi, loops, and inconsistent
   * geometry throw.
   * Metadata types default to NodeAttributes/EdgeAttributes; specify custom types explicitly.
   */
  static fromGraphology<N extends object = NodeAttributes, E extends object = EdgeAttributes>(
    graph: AbstractGraph,
    ...args: GraphologyImportArgs<NoInfer<N>, NoInfer<E>>
  ): SpatialGraph<N, E> {
    const config = args[0] ?? {};
    return SpatialGraph.fromJSON<N, E>(
      decodeGraphology<N, E>(graph, config),
      ...(args as ConstructorArgs<N, E>),
    );
  }

  /** Independent Flatten points; empty for no nodes. */
  getFlattenPoints(): Point[] {
    return this.getNodePoints().map((point) => new Point(...point));
  }

  /** Independent Flatten segments; empty for no edges. */
  getFlattenSegments(): Segment[] {
    return this.getEdgeSegments().map(([a, b]) => new Segment(new Point(...a), new Point(...b)));
  }

  /** Explicit Flatten segment insertion. @throws For arcs/unsupported shapes before mutation. */
  addFlattenSegment(shape: Segment, ...args: AttributeArgs<E>): EdgeInsertResult<N, E> {
    return this.addEdges(flattenSegments([{ shape, attributes: (args[0] ?? {}) as E }]))
      .results[0]!;
  }

  /** Explicit Flatten batch adapter; rejects unsupported shapes atomically. */
  addFlattenSegments(
    records: readonly {
      shape: unknown;
      attributes: E;
    }[],
  ): BatchInsertResult<N, E> {
    return this.addEdges(flattenSegments(records));
  }

  /** Explicit Flatten removal; false when absent. */
  removeFlattenSegment(segment: Segment): boolean {
    return this.removeEdge(flattenSegments([{ shape: segment, attributes: {} }])[0]!.endpoints);
  }

  /**
   * Per-edge LineStrings and isolated Points with user metadata. Cartesian length remains planar.
   */
  toGeoJSON(): GeoJSONCollection {
    return encodeGeoJSON(this.export());
  }

  /**
   * Import Point/LineString/MultiLineString features; unsupported/extra-dimensional geometry throws
   * atomically.
   */
  static fromGeoJSON(
    data: unknown,
    options: {
      coordinatePrecision?: number | null;
      dropExtraDimensions?: boolean;
      onReport?: (report: BatchInsertResult) => void;
    } = {},
  ): SpatialGraph {
    const decoded = decodeGeoJSON(data, options);
    const graph = new SpatialGraph({ coordinatePrecision: options.coordinatePrecision });
    const report = graph.addEdges(decoded.edges);

    for (const node of decoded.nodes) {
      graph.addNode(node.point, node.attributes);
    }
    options.onReport?.(report);
    return graph;
  }

  /** Build a proximity/visibility graph using a caller's rule on canonical coordinates. */
  static fromPoints(
    points: readonly Point2D[],
    options: {
      connect: (a: Point2D, b: Point2D) => boolean;
      coordinatePrecision?: number | null;
      edgeAttributes?: (a: Point2D, b: Point2D) => EdgeAttributes;
    },
  ): SpatialGraph {
    const graph = new SpatialGraph({ coordinatePrecision: options.coordinatePrecision });

    for (const point of points) {
      graph.addNode(point);
    }

    const canonical = graph.getNodePoints();
    const records: EdgeRecord[] = [];

    for (let i = 0; i < canonical.length; i++) {
      for (let j = i + 1; j < canonical.length; j++) {
        const a = canonical[i]!;
        const b = canonical[j]!;

        if (options.connect(a, b)) {
          records.push({ endpoints: [a, b], attributes: options.edgeAttributes?.(a, b) ?? {} });
        }
      }
    }
    graph.addEdges(records);
    return graph;
  }
}
