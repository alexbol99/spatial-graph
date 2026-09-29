import graphology from 'graphology';
import type { GraphConstructor } from 'graphology-types';
import { dijkstra } from 'graphology-shortest-path';
import { Segment, Point, Multiline } from '@flatten-js/core';
import type {
  NxPoint,
  NxEdge,
  EdgeAttributes,
  NodeAttributes,
  SpatialGraphOptions,
  FilterPredicate,
  IsValidCallback,
} from './types.js';
import {
  roundPoint,
  toFlattenPoint,
  toFlattenSegment,
  fromFlattenSegment,
  getLinesAngleByCross,
  getLinesDot,
  hasValidLength,
  pointsEqual,
} from './utils/geometry.js';
import { projectEdgeToLine, projectPointOnSegment } from './utils/projection.js';
import {
  DEFAULT_ANGLE_TOLERANCE_DEG,
  MIN_EDGE_MOVEMENT_DISTANCE,
  RIGHT_ANGLE_DEG,
  JUNCTION_MIN_DEGREE,
  STUB_DEGREE,
} from './constants.js';

// graphology is CommonJS (`module.exports = Graph`) but ships ESM-style typings,
// so its default import is typed differently from ESM and CJS consumers.
// At runtime it is the Graph class in both; graphology-types' GraphConstructor
// gives it one type regardless of module format.
const Graph = graphology as unknown as GraphConstructor<NodeAttributes, EdgeAttributes>;

/**
 * SpatialGraph represents a 2D planar graph with geometric operations
 * It extends graphology's Graph class and provides spatial query methods
 */
export class SpatialGraph extends Graph {
  constructor(options?: SpatialGraphOptions) {
    super({ type: 'undirected', multi: false });

    if (options?.segments) {
      this.addSegments(options.segments, options.attrs);
    }
  }

  /**
   * Convert a point to a string key for use in graphology
   */
  protected nodeKey(point: NxPoint): string {
    const rounded = roundPoint(point);
    return `${rounded[0]},${rounded[1]}`;
  }

  /**
   * Get the coordinate-derived graphology key for a point.
   */
  getPointKey(point: NxPoint): string {
    return this.nodeKey(point);
  }

  /**
   * Parse a node key back to a point
   */
  protected parseNode(key: string): NxPoint | null {
    const parts = key.split(',');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);

    if (isNaN(x) || isNaN(y)) return null;

    return [x, y];
  }

  /**
   * Add an edge with attributes
   */
  protected addEdgeWithAttrs(
    start: NxPoint,
    end: NxPoint,
    attrs: Record<string, unknown> = {},
  ): void {
    const startKey = this.nodeKey(start);
    const endKey = this.nodeKey(end);

    // Distinct coordinates can round to the same node key; the edge would be a
    // zero-length self-loop in graph space.
    if (startKey === endKey) {
      return;
    }

    // Ensure nodes exist
    if (!this.hasNode(startKey)) {
      this.addNode(startKey);
    }
    if (!this.hasNode(endKey)) {
      this.addNode(endKey);
    }

    // Weight is the distance between the nodes as stored, i.e. rounded
    const segment = new Segment(toFlattenPoint(roundPoint(start)), toFlattenPoint(roundPoint(end)));
    const weight = segment.length;

    // Add edge if it doesn't exist
    if (!this.hasEdge(startKey, endKey)) {
      this.addEdge(startKey, endKey, { ...attrs, weight });
    }
  }

  /**
   * Find edge key between two nodes
   */
  protected findEdgeKey(start: NxPoint, end: NxPoint): string | null {
    const startKey = this.nodeKey(start);
    const endKey = this.nodeKey(end);

    if (!this.hasNode(startKey) || !this.hasNode(endKey)) {
      return null;
    }

    return this.edge(startKey, endKey) || null;
  }

  /**
   * Find the graphology edge key for an edge.
   */
  getEdgeKeyFor(edge: NxEdge): string | null {
    return this.findEdgeKey(edge[0], edge[1]);
  }

  /**
   * Return an edge between two points when it exists.
   */
  getEdgeBetweenPoints(start: NxPoint, end: NxPoint): NxEdge | null {
    return this.findEdgeKey(start, end) ? [roundPoint(start), roundPoint(end)] : null;
  }

  /**
   * Copy edge attributes from an existing edge
   */
  protected copyEdgeAttributes(start: NxPoint, end: NxPoint): Record<string, unknown> {
    const edgeKey = this.findEdgeKey(start, end);
    if (!edgeKey) return {};

    return { ...this.getEdgeAttributes(edgeKey) };
  }

  /**
   * Normalize segments input (flatten Multiline to Segments)
   */
  private normalizeSegments(
    segments: Array<Segment | Multiline>,
    attrs?: Array<Record<string, unknown>>,
  ): Array<{ segment: Segment; attr: Record<string, unknown> }> {
    const result: Array<{ segment: Segment; attr: Record<string, unknown> }> = [];

    for (const [index, item] of segments.entries()) {
      const attr = attrs?.[index] || {};
      if (item instanceof Multiline) {
        // Convert multiline to individual segments
        const shapes = item.toShapes();
        for (const shape of shapes) {
          if (shape instanceof Segment) {
            result.push({ segment: shape, attr });
          }
        }
      } else if (item instanceof Segment) {
        result.push({ segment: item, attr });
      }
    }

    return result;
  }

  /**
   * Add multiple segments to the graph
   */
  addSegments(segments: Array<Segment | Multiline>, attrs?: Array<Record<string, unknown>>): void {
    const normalizedSegments = this.normalizeSegments(segments, attrs);

    normalizedSegments.forEach(({ segment, attr }) => {
      this.addSegment(segment, attr);
    });
  }

  /**
   * Add a single segment to the graph
   */
  addSegment(segment: Segment, attr: Record<string, unknown> = {}): void {
    if (!hasValidLength(segment)) {
      return;
    }

    const start = fromFlattenSegment(segment)[0];
    const end = fromFlattenSegment(segment)[1];

    this.addEdgeWithAttrs(start, end, attr);
  }

  /**
   * Add a vertex (node) to the graph
   */
  addVertex(point: NxPoint, attr: Record<string, unknown> = {}): void {
    const key = this.nodeKey(point);
    if (!this.hasNode(key)) {
      this.addNode(key, attr);
    } else {
      this.mergeNodeAttributes(key, attr);
    }
  }

  hasPointNode(point: NxPoint): boolean {
    return this.hasNode(this.nodeKey(point));
  }

  getPointDegree(point: NxPoint): number {
    const key = this.nodeKey(point);
    return this.hasNode(key) ? this.degree(key) : 0;
  }

  getPointNeighbors(point: NxPoint): NxPoint[] {
    const key = this.nodeKey(point);
    if (!this.hasNode(key)) return [];

    return this.neighbors(key).flatMap((neighbor) => {
      const parsed = this.parseNode(neighbor);
      return parsed ? [parsed] : [];
    });
  }

  getPointAttributes(point: NxPoint): NodeAttributes {
    const key = this.nodeKey(point);
    return this.hasNode(key) ? this.getNodeAttributes(key) : {};
  }

  mergePointAttributes(point: NxPoint, attrs: Record<string, unknown>): void {
    const key = this.nodeKey(point);
    if (!this.hasNode(key)) {
      this.addNode(key, attrs);
      return;
    }

    this.mergeNodeAttributes(key, attrs);
  }

  getEdgeAttributesFor(edge: NxEdge): EdgeAttributes | null {
    const edgeKey = this.findEdgeKey(edge[0], edge[1]);
    return edgeKey ? this.getEdgeAttributes(edgeKey) : null;
  }

  mergeEdgePointAttributes(edge: NxEdge, attrs: Record<string, unknown>): void {
    const edgeKey = this.findEdgeKey(edge[0], edge[1]);
    if (!edgeKey) return;
    this.mergeEdgeAttributes(edgeKey, attrs);
  }

  removeEdge(edge: NxEdge): void {
    this.removeSegment(toFlattenSegment(edge));
  }

  removeEdges(edges: NxEdge[]): void {
    edges.forEach((edge) => this.removeEdge(edge));
  }

  removePoint(point: NxPoint): void {
    const key = this.nodeKey(point);
    if (this.hasNode(key)) {
      this.dropNode(key);
    }
  }

  removePoints(points: NxPoint[]): void {
    points.forEach((point) => this.removePoint(point));
  }

  /**
   * Remove a segment from the graph
   */
  removeSegment(segment: Segment): void {
    const edge = fromFlattenSegment(segment);
    const startKey = this.nodeKey(edge[0]);
    const endKey = this.nodeKey(edge[1]);

    if (this.hasEdge(startKey, endKey)) {
      this.dropEdge(startKey, endKey);
    }
  }

  /**
   * Get all edges as NxEdge array
   */
  getEdges(): NxEdge[] {
    const edges: NxEdge[] = [];

    this.forEachEdge((edge, attrs, source, target) => {
      const start = this.parseNode(source);
      const end = this.parseNode(target);

      if (start && end) {
        edges.push([start, end]);
      }
    });

    return edges;
  }

  /**
   * Get all nodes as NxPoint array
   */
  getNodes(): NxPoint[] {
    const nodes: NxPoint[] = [];

    this.forEachNode((node) => {
      const point = this.parseNode(node);
      if (point) {
        nodes.push(point);
      }
    });

    return nodes;
  }

  /**
   * Get all segments as Segment array
   */
  getSegments(): Segment[] {
    return this.getEdges().map((edge) => toFlattenSegment(edge));
  }

  /**
   * Get all vertices as Point array
   */
  getVertices(): Point[] {
    return this.getNodes().map((node) => toFlattenPoint(node));
  }

  /**
   * Get all junction nodes (degree > 2)
   */
  getJunctions(): NxPoint[] {
    const junctions: NxPoint[] = [];

    this.forEachNode((node) => {
      if (this.degree(node) > JUNCTION_MIN_DEGREE) {
        const point = this.parseNode(node);
        if (point) {
          junctions.push(point);
        }
      }
    });

    return junctions;
  }

  /**
   * Get all stub nodes (degree = 1)
   */
  getStubs(): NxPoint[] {
    const stubs: NxPoint[] = [];

    this.forEachNode((node) => {
      if (this.degree(node) === STUB_DEGREE) {
        const point = this.parseNode(node);
        if (point) {
          stubs.push(point);
        }
      }
    });

    return stubs;
  }

  /**
   * Check if a point is a stub (dead end)
   */
  isStub(point: NxPoint): boolean {
    const key = this.nodeKey(point);
    return this.hasNode(key) && this.degree(key) === STUB_DEGREE;
  }

  /**
   * Check if a node has orthogonal edges (perpendicular edges)
   */
  hasOrthogonalEdges(node: NxPoint, toleranceDeg = DEFAULT_ANGLE_TOLERANCE_DEG): boolean {
    const key = this.nodeKey(node);
    if (!this.hasNode(key)) return false;

    const neighbors = this.neighbors(key);
    if (neighbors.length < 2) return false;

    // Get all edges connected to this node
    const edges: Segment[] = [];
    neighbors.forEach((neighbor) => {
      const neighborPoint = this.parseNode(neighbor);
      if (neighborPoint) {
        edges.push(toFlattenSegment([node, neighborPoint]));
      }
    });

    // Check all pairs of edges for orthogonality
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const edge1 = edges[i];
        const edge2 = edges[j];
        if (!edge1 || !edge2) continue;

        const angle = getLinesAngleByCross(edge1, edge2);
        const isRightAngle = Math.abs(angle - RIGHT_ANGLE_DEG) <= toleranceDeg;

        if (isRightAngle) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all nodes that have orthogonal edges
   */
  getNodesWithOrthogonalEdges(toleranceDeg = DEFAULT_ANGLE_TOLERANCE_DEG): NxPoint[] {
    const nodes: NxPoint[] = [];

    this.forEachNode((node) => {
      const point = this.parseNode(node);
      if (point && this.hasOrthogonalEdges(point, toleranceDeg)) {
        nodes.push(point);
      }
    });

    return nodes;
  }

  /**
   * Find the nearest edge to a point
   */
  findNearestEdge(point: NxPoint | Point): Segment {
    const p = point instanceof Point ? point : toFlattenPoint(point);
    const edges = this.getSegments();

    if (edges.length === 0) {
      throw new Error('Graph has no edges');
    }

    let nearestEdge: Segment | null = edges[0] || null;
    if (!nearestEdge) {
      throw new Error('Graph has no edges');
    }

    let minDistance = nearestEdge.distanceTo(p)[0];

    for (let i = 1; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge) continue;

      const distance = edge.distanceTo(p)[0];
      if (distance < minDistance) {
        minDistance = distance;
        nearestEdge = edge;
      }
    }

    return nearestEdge;
  }

  /**
   * Project a point onto the closest edge
   * Returns the projected point and the edge
   */
  projectPointOnClosestEdge(point: NxPoint): [NxPoint, NxEdge] {
    const nearestEdge = this.findNearestEdge(point);
    const projectedPoint = projectPointOnSegment(point, nearestEdge);
    const edge = fromFlattenSegment(nearestEdge);

    return [projectedPoint, edge];
  }

  /**
   * Get the closest node to a point
   */
  getClosestNodeToPoint(point: Point | NxPoint): NxPoint {
    const p = point instanceof Point ? point : toFlattenPoint(point);
    const nodes = this.getNodes();

    if (nodes.length === 0) {
      throw new Error('Graph has no nodes');
    }

    let closestNode: NxPoint | null = nodes[0] || null;
    if (!closestNode) {
      throw new Error('Graph has no nodes');
    }

    let minDistance = toFlattenPoint(closestNode).distanceTo(p)[0];

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;

      const distance = toFlattenPoint(node).distanceTo(p)[0];
      if (distance < minDistance) {
        minDistance = distance;
        closestNode = node;
      }
    }

    return closestNode;
  }

  /**
   * Get the shortest path between two points
   * Returns an array of segments representing the path
   */
  getShortestPath(start: NxPoint, end: NxPoint): Segment[] {
    const startKey = this.nodeKey(start);
    const endKey = this.nodeKey(end);

    if (!this.hasNode(startKey) || !this.hasNode(endKey)) {
      return [];
    }

    // Bidirectional Dijkstra over the edge `weight` (segment length)
    const path = dijkstra.bidirectional(this, startKey, endKey, 'weight');

    if (!path || path.length < 2) {
      return [];
    }

    // Convert path nodes to segments
    const segments: Segment[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const pathNode1 = path[i];
      const pathNode2 = path[i + 1];
      if (!pathNode1 || !pathNode2) continue;

      const p1 = this.parseNode(pathNode1);
      const p2 = this.parseNode(pathNode2);

      if (p1 && p2) {
        segments.push(toFlattenSegment([p1, p2]));
      }
    }

    return segments;
  }

  /**
   * Get a subgraph containing only edges with a specific attribute value
   */
  getSubgraph(attrName: string, attrValue: unknown): SpatialGraph {
    const subgraph = new SpatialGraph();

    this.forEachEdge((edge, attrs, source, target) => {
      if (attrs[attrName] === attrValue) {
        const start = this.parseNode(source);
        const end = this.parseNode(target);

        if (start && end) {
          subgraph.addEdgeWithAttrs(start, end, attrs);
        }
      }
    });

    return subgraph;
  }

  /**
   * Get filtered nodes based on a predicate function
   */
  getFilteredNodes(filterPredicate: FilterPredicate): NxPoint[] {
    const nodes: NxPoint[] = [];

    this.forEachNode((node, attrs) => {
      const point = this.parseNode(node);
      if (point && filterPredicate(point, attrs)) {
        nodes.push(point);
      }
    });

    return nodes;
  }

  /**
   * Move a node to a new position
   * Updates all connected edges
   */
  moveNode(node: NxPoint, newNode: NxPoint): void {
    this.moveNodes([[node, newNode]]);
  }

  /**
   * Move multiple nodes at once
   *
   * All targets are resolved before the graph changes, so the moves apply
   * simultaneously: in `[[a, b], [b, c]]` node `a` lands on `b`'s old position
   * while `b` moves on to `c`, instead of `a` first collapsing into `b`.
   * A node moved onto an existing node is merged into it. Throws before any
   * change if a source node does not exist.
   */
  moveNodes(nodesToMove: Array<[NxPoint, NxPoint]>): void {
    const moves = new Map<string, NxPoint>();
    for (const [node, newNode] of nodesToMove) {
      const oldKey = this.nodeKey(node);
      if (!this.hasNode(oldKey)) {
        throw new Error('Node does not exist');
      }
      if (!pointsEqual(node, newNode)) {
        moves.set(oldKey, newNode);
      }
    }

    if (moves.size === 0) {
      return; // No movement needed
    }

    // Snapshot moved nodes and every edge touching them
    const movedNodes: Array<{ target: NxPoint; attrs: NodeAttributes }> = [];
    const edgeData: Array<{ source: string; target: string; attrs: EdgeAttributes }> = [];
    const seenEdges = new Set<string>();

    moves.forEach((target, oldKey) => {
      movedNodes.push({ target, attrs: this.getNodeAttributes(oldKey) });
      this.forEachEdge(oldKey, (edgeKey, attrs, source, edgeTarget) => {
        if (seenEdges.has(edgeKey)) return;
        seenEdges.add(edgeKey);
        edgeData.push({ source, target: edgeTarget, attrs });
      });
    });

    moves.forEach((_, oldKey) => this.dropNode(oldKey));

    // Add new nodes or merge attrs into an existing collapse target.
    movedNodes.forEach(({ target, attrs }) => {
      const newKey = this.nodeKey(target);
      if (!this.hasNode(newKey)) {
        this.addNode(newKey, attrs);
      } else {
        const targetAttrs = this.getNodeAttributes(newKey);
        this.replaceNodeAttributes(newKey, { ...attrs, ...targetAttrs });
      }
    });

    // Recreate edges between the new endpoint positions
    const positionOf = (key: string): NxPoint | null => moves.get(key) ?? this.parseNode(key);
    edgeData.forEach(({ source, target, attrs }) => {
      const start = positionOf(source);
      const end = positionOf(target);
      if (start && end) {
        this.addEdgeWithAttrs(start, end, attrs);
      }
    });
  }

  /**
   * Collapse one point into another point, rewiring source incident edges to the target.
   */
  collapsePointInto(source: NxPoint, target: NxPoint): void {
    const sourceKey = this.nodeKey(source);
    const targetKey = this.nodeKey(target);

    if (!this.hasNode(sourceKey) || pointsEqual(source, target)) {
      return;
    }

    const targetPoint = roundPoint(target);
    const sourceAttrs = this.getNodeAttributes(sourceKey);
    const targetAttrs = this.hasNode(targetKey) ? this.getNodeAttributes(targetKey) : {};
    const edgeData = this.neighbors(sourceKey).flatMap((neighbor) => {
      const edgeKey = this.edge(sourceKey, neighbor);
      const neighborPoint = this.parseNode(neighbor);
      if (!edgeKey || !neighborPoint) return [];

      return [
        {
          neighbor,
          neighborPoint,
          attrs: this.getEdgeAttributes(edgeKey),
        },
      ];
    });

    this.dropNode(sourceKey);

    if (!this.hasNode(targetKey)) {
      this.addNode(targetKey, sourceAttrs);
    } else {
      this.replaceNodeAttributes(targetKey, { ...sourceAttrs, ...targetAttrs });
    }

    edgeData.forEach(({ neighbor, neighborPoint, attrs }) => {
      if (neighbor === targetKey) return;

      const existingEdgeKey = this.edge(targetKey, neighbor);
      if (existingEdgeKey) {
        const existingAttrs = this.getEdgeAttributes(existingEdgeKey);
        this.replaceEdgeAttributes(existingEdgeKey, { ...attrs, ...existingAttrs });
        return;
      }

      this.addEdgeWithAttrs(targetPoint, neighborPoint, attrs);
    });
  }

  /**
   * Remove a degree-1 point and its incident edge.
   */
  removeStubPoint(point: NxPoint): void {
    const key = this.nodeKey(point);
    if (!this.hasNode(key) || this.degree(key) !== STUB_DEGREE) {
      return;
    }

    this.dropNode(key);
  }

  /**
   * Remove a degree-2 point and join its neighbors with one edge.
   */
  removeDegree2PointAndJoin(point: NxPoint, attrs?: Partial<EdgeAttributes>): void {
    const key = this.nodeKey(point);
    if (!this.hasNode(key) || this.degree(key) !== 2) {
      return;
    }

    const neighbors = this.neighbors(key);
    const firstNeighbor = neighbors[0];
    const secondNeighbor = neighbors[1];
    if (!firstNeighbor || !secondNeighbor) {
      return;
    }

    const firstPoint = this.parseNode(firstNeighbor);
    const secondPoint = this.parseNode(secondNeighbor);
    if (!firstPoint || !secondPoint || firstNeighbor === secondNeighbor) {
      return;
    }

    const firstEdgeKey = this.edge(key, firstNeighbor);
    const secondEdgeKey = this.edge(key, secondNeighbor);
    const firstAttrs = firstEdgeKey ? this.getEdgeAttributes(firstEdgeKey) : {};
    const secondAttrs = secondEdgeKey ? this.getEdgeAttributes(secondEdgeKey) : {};
    const joinedAttrs = attrs ?? { ...firstAttrs, ...secondAttrs };
    const hasJoinedEdge = this.hasEdge(firstNeighbor, secondNeighbor);

    this.dropNode(key);

    if (hasJoinedEdge) {
      return;
    }

    this.addEdgeWithAttrs(firstPoint, secondPoint, joinedAttrs);
  }

  getEdgeWeight(edge: NxEdge): number {
    return this.getEdgeAttributesFor(edge)?.weight ?? 0;
  }

  getLongestEdgeInPath(path: NxPoint[]): NxEdge | null {
    if (path.length < 2) return null;

    let longestEdge: NxEdge | null = null;
    let longestWeight = -Infinity;

    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      if (!start || !end) continue;

      const edge: NxEdge = [start, end];
      const weight = this.getEdgeWeight(edge);
      if (weight > longestWeight) {
        longestWeight = weight;
        longestEdge = edge;
      }
    }

    return longestEdge;
  }

  getPathLength(path: NxPoint[]): number {
    let length = 0;

    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      if (start && end) {
        length += this.getEdgeWeight([start, end]);
      }
    }

    return length;
  }

  calculatedMovement(path: NxPoint[], line: Segment): Array<[NxPoint, NxPoint]> {
    const nodesToMove: Array<[NxPoint, NxPoint]> = [];

    for (let index = 0; index < path.length - 1; index += 1) {
      const start = path[index];
      const end = path[index + 1];
      if (!start || !end) continue;

      const [newStart, newEnd] = projectEdgeToLine([start, end], line);
      if (
        toFlattenPoint(newStart).distanceTo(toFlattenPoint(newEnd))[0] < MIN_EDGE_MOVEMENT_DISTANCE
      ) {
        break;
      }

      const movedSegment = toFlattenSegment([newStart, newEnd]);
      if (getLinesDot(movedSegment, line) < 0) {
        continue;
      }

      if (nodesToMove.length === 0) {
        nodesToMove.push([start, newStart]);
      }
      nodesToMove.push([end, newEnd]);
    }

    return nodesToMove;
  }

  findIsolatedPaths(nodesSubset?: NxPoint[]): NxPoint[][] {
    const allowedKeys = nodesSubset ? new Set(nodesSubset.map((node) => this.nodeKey(node))) : null;
    const allowed = (key: string) => !allowedKeys || allowedKeys.has(key);
    const degreeWithin = (key: string) => this.neighbors(key).filter(allowed).length;
    const visitedEdgeKeys = new Set<string>();
    const paths: NxPoint[][] = [];
    const nodeKeys = this.nodes().filter(allowed);
    const starts = nodeKeys.filter((key) => degreeWithin(key) <= 1);

    for (const start of starts) {
      for (const neighbor of this.neighbors(start).filter(allowed)) {
        const edgeKey = orderedNodePairKey(start, neighbor);
        if (visitedEdgeKeys.has(edgeKey)) continue;

        const pathKeys = [start];
        let previous: string | null = null;
        let current = start;
        let next: string | null = neighbor;

        while (next) {
          visitedEdgeKeys.add(orderedNodePairKey(current, next));
          previous = current;
          current = next;
          pathKeys.push(current);

          const candidates = this.neighbors(current).filter((candidate) => {
            if (!allowed(candidate) || candidate === previous) return false;
            return !visitedEdgeKeys.has(orderedNodePairKey(current, candidate));
          });

          if (degreeWithin(current) !== 2 || candidates.length === 0) {
            break;
          }
          next = candidates[0] ?? null;
        }

        const path = pathKeys.flatMap((key) => {
          const point = this.parseNode(key);
          return point ? [point] : [];
        });
        if (path.length > 1) paths.push(path);
      }
    }

    return paths;
  }

  findPaths(): NxPoint[][] {
    const visitedEdgeKeys = new Set<string>();
    const paths: NxPoint[][] = [];
    const nodeKeys = this.nodes();
    const branchKeys = nodeKeys.filter((key) => this.degree(key) !== 2);

    for (const start of branchKeys) {
      for (const neighbor of this.neighbors(start)) {
        if (visitedEdgeKeys.has(orderedNodePairKey(start, neighbor))) continue;

        const path = this.walkPath(start, neighbor, visitedEdgeKeys);
        if (path.length > 1) {
          paths.push(path);
        }
      }
    }

    for (const edge of this.edges()) {
      const [source, target] = this.extremities(edge);
      if (!source || !target || visitedEdgeKeys.has(orderedNodePairKey(source, target))) continue;

      const path = this.walkPath(source, target, visitedEdgeKeys);
      if (path.length > 1) {
        paths.push(path);
      }
    }

    return paths;
  }

  private walkPath(start: string, next: string, visitedEdgeKeys: Set<string>): NxPoint[] {
    const pathKeys = [start];
    let previous = start;
    let current: string | null = next;

    while (current) {
      visitedEdgeKeys.add(orderedNodePairKey(previous, current));
      pathKeys.push(current);

      if (current === start || this.degree(current) !== 2) {
        break;
      }

      const currentKey: string = current;
      const nextCandidate: string | undefined = this.neighbors(currentKey).find(
        (neighbor) =>
          neighbor !== previous && !visitedEdgeKeys.has(orderedNodePairKey(currentKey, neighbor)),
      );

      previous = current;
      current = nextCandidate ?? null;
    }

    return pathKeys.flatMap((key) => {
      const point = this.parseNode(key);
      return point ? [point] : [];
    });
  }

  /**
   * Split an edge at a point
   * Removes the original edge and adds two new edges
   */
  splitEdge(edge: NxEdge, point: NxPoint): void {
    if (!this.findEdgeKey(edge[0], edge[1])) {
      return;
    }

    const node = roundPoint(point);
    if (pointsEqual(edge[0], node) || pointsEqual(edge[1], node)) {
      return;
    }

    const segment = toFlattenSegment(edge);
    const attrs = this.copyEdgeAttributes(edge[0], edge[1]);
    const originalId = attrs.id;
    delete attrs.id;

    this.removeSegment(segment);

    const firstEdge: NxEdge = [roundPoint(edge[0]), node];
    const secondEdge: NxEdge = [node, roundPoint(edge[1])];
    const firstEdgeId = orderedNodePairKey(this.nodeKey(firstEdge[0]), this.nodeKey(firstEdge[1]));
    const secondEdgeId = orderedNodePairKey(
      this.nodeKey(secondEdge[0]),
      this.nodeKey(secondEdge[1]),
    );

    this.addEdgeWithAttrs(firstEdge[0], firstEdge[1], {
      ...attrs,
      ...(originalId ? { id: firstEdgeId } : {}),
    });
    this.addEdgeWithAttrs(secondEdge[0], secondEdge[1], {
      ...attrs,
      ...(originalId ? { id: secondEdgeId } : {}),
    });
  }

  /**
   * Merge this graph with another graph
   */
  union(other: SpatialGraph): void {
    // Add all nodes from other graph
    other.forEachNode((node, attrs) => {
      if (!this.hasNode(node)) {
        this.addNode(node, attrs);
      }
    });

    // Add all edges from other graph
    other.forEachEdge((edge, attrs, source, target) => {
      if (!this.hasEdge(source, target)) {
        this.addEdge(source, target, attrs);
      }
    });
  }

  // ─── Element labels ─────────────────────────────────────────────────────────

  /**
   * The `label` attribute of a node, when it carries one.
   *
   * Labels travel as ordinary attributes, so they survive `moveNode` and the
   * collapse merges for free. What they do NOT survive is serialization — see
   * `CirculationGraph.toGraphology`, which has to emit them explicitly.
   */
  getNodeLabel(point: NxPoint): string | null {
    const key = this.nodeKey(point);
    if (!this.hasNode(key)) return null;

    const label = this.getNodeAttribute(key, 'label');
    return typeof label === 'string' ? label : null;
  }

  /** Set (or, with `null`, clear) a node's label. */
  setNodeLabel(point: NxPoint, label: string | null): void {
    const key = this.nodeKey(point);
    if (!this.hasNode(key)) return;

    if (label === null) this.removeNodeAttribute(key, 'label');
    else this.setNodeAttribute(key, 'label', label);
  }

  /** The `label` attribute of an edge, when it carries one. */
  getEdgeLabel(edge: NxEdge): string | null {
    const key = this.findEdgeKey(edge[0], edge[1]);
    if (!key) return null;

    const label = this.getEdgeAttribute(key, 'label');
    return typeof label === 'string' ? label : null;
  }

  /** Set (or, with `null`, clear) an edge's label. */
  setEdgeLabel(edge: NxEdge, label: string | null): void {
    const key = this.findEdgeKey(edge[0], edge[1]);
    if (!key) return;

    if (label === null) this.removeEdgeAttribute(key, 'label');
    else this.setEdgeAttribute(key, 'label', label);
  }

  // ─── Traversal ──────────────────────────────────────────────────────────────

  /**
   * Split the graph into connected components, each listed as its own nodes.
   * Plain BFS — graphology ships no component helper and pulling in
   * `graphology-components` for one traversal isn't worth a dependency.
   */
  getConnectedComponents(): NxPoint[][] {
    const seen = new Set<string>();
    const components: NxPoint[][] = [];

    for (const start of this.getNodes()) {
      if (seen.has(this.nodeKey(start))) continue;

      const component: NxPoint[] = [];
      const queue: NxPoint[] = [start];
      seen.add(this.nodeKey(start));

      while (queue.length > 0) {
        const node = queue.shift()!;
        component.push(node);

        for (const neighbor of this.getPointNeighbors(node)) {
          const key = this.nodeKey(neighbor);
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push(neighbor);
        }
      }

      components.push(component);
    }

    return components;
  }

  /**
   * Neighbours of `node`, ordered by how far LEFT the turn onto each one is for
   * a walk arriving along `incoming` (the direction of travel into the node).
   *
   * Measuring `(back - out) mod 2π` and sorting ascending puts the sharpest left
   * turn first: left = π/2, straight ahead = π, right = 3π/2. That ordering is
   * what makes a depth-first walk trace faces counter-clockwise.
   */
  getNeighborsByLeftTurn(node: NxPoint, incoming: NxPoint): NxPoint[] {
    const back = Math.atan2(-incoming[1], -incoming[0]);

    return this.getPointNeighbors(node)
      .map((neighbor) => ({
        neighbor,
        key: this.nodeKey(neighbor),
        turn: normalizeAngle(back - Math.atan2(neighbor[1] - node[1], neighbor[0] - node[0])),
      }))
      .sort((a, b) => a.turn - b.turn || a.key.localeCompare(b.key))
      .map((entry) => entry.neighbor);
  }

  /**
   * Create a complete graph from a set of nodes
   * Only adds edges that pass the validation callback
   */
  static createCompleteGraph(nodes: NxPoint[], isValidCb: IsValidCallback): SpatialGraph {
    const graph = new SpatialGraph();

    // Add all nodes
    nodes.forEach((node) => graph.addVertex(node));

    // Add edges between all pairs of nodes that pass validation
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        if (!node1 || !node2) continue;

        if (isValidCb(node1, node2)) {
          graph.addEdgeWithAttrs(node1, node2);
        }
      }
    }

    return graph;
  }
}

function orderedNodePairKey(first: string, second: string): string {
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

/** Fold an angle into [0, 2π) so turn comparisons never straddle the ±π seam. */
function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}
