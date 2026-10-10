import type { NodeAttributes, EdgeAttributes, SpatialGraphJSON, Point2D } from '../types.js';
import { canonicalPoint, parseKey, pointKey, validatePrecision } from '../internal/coordinates.js';
import {
  compareKeys,
  copyData,
  pairKey,
  validateAngle,
  validateSegment,
  validateTolerance,
} from '../utils/geometry.js';

export function dictionary(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected an object dictionary in graph data.');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Expected a nodes/edges array in graph data.');
  }
  return value;
}

function key(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new TypeError('Graph keys must be nonempty strings.');
  }
  return value;
}

/** Validate the entire envelope before creating any graph storage. */
export function decodeGraphJSON<N extends object, E extends object>(
  input: unknown,
): SpatialGraphJSON<N, E> {
  const data = dictionary(input);
  if (data.schema !== 'spatial-graph' || data.version !== 2) {
    throw new Error(
      'Unsupported graph schema/version; use version 2 or the explicit legacy importer.',
    );
  }
  const options = dictionary(data.options);
  if (options.coordinatePrecision === undefined) {
    throw new Error(
      'Serialized coordinatePrecision is required; specify null for exact coordinates.',
    );
  }
  const precision = options.coordinatePrecision as number | null;
  validatePrecision(precision);
  const positionTolerance = options.positionTolerance as number;
  const straightAngleToleranceDeg = options.straightAngleToleranceDeg as number;
  validateTolerance(positionTolerance);
  validateAngle(straightAngleToleranceDeg);
  const positions = new Map<string, Point2D>();
  const nodes = array(data.nodes).map((input) => {
    const node = dictionary(input);
    const nodeKey = key(node.key);
    const point = canonicalPoint(node.point as Point2D, precision);
    if (
      pointKey(point) !== nodeKey ||
      point[0] !== (node.point as Point2D)[0] ||
      point[1] !== (node.point as Point2D)[1]
    ) {
      throw new Error(
        'Serialized node key/coordinates are inconsistent; export canonical stored coordinates.',
      );
    }
    if (positions.has(nodeKey)) {
      throw new Error('Duplicate serialized node key; keep one record per position.');
    }
    positions.set(nodeKey, point);
    return { key: nodeKey, point, attributes: copyData(dictionary(node.attributes)) as N };
  });
  const edgeKeys = new Set<string>();
  const pairs = new Set<string>();
  const edges = array(data.edges).map((input) => {
    const edge = dictionary(input);
    const edgeKey = key(edge.key);
    const source = key(edge.source);
    const target = key(edge.target);
    const pair = pairKey(source, target);
    if (!positions.has(source) || !positions.has(target)) {
      throw new Error('Serialized edge has a missing endpoint; include both node records.');
    }
    if (source === target || pairs.has(pair) || edgeKeys.has(edgeKey)) {
      throw new Error('Serialized graph must be simple and loop-free, with unique edge keys.');
    }
    validateSegment([positions.get(source)!, positions.get(target)!]);
    edgeKeys.add(edgeKey);
    pairs.add(pair);
    return { key: edgeKey, source, target, attributes: copyData(dictionary(edge.attributes)) as E };
  });
  return {
    schema: 'spatial-graph',
    version: 2,
    options: { coordinatePrecision: precision, positionTolerance, straightAngleToleranceDeg },
    attributes: copyData(dictionary(data.attributes)),
    nodes,
    edges,
  };
}

export interface LegacyReport {
  mergedNodes: number;
  collapsedEdges: number;
  mergedEdges: number;
}

export function decodeLegacyJSON(
  input: unknown,
  options: { coordinatePrecision: number | null; positionTolerance?: number },
): { data: SpatialGraphJSON; report: LegacyReport } {
  validatePrecision(options.coordinatePrecision);
  const data = dictionary(input);
  const topology = dictionary(data.options ?? {});
  if ((topology.type !== undefined && topology.type !== 'undirected') || topology.multi === true) {
    throw new Error('Legacy graph must be undirected and simple.');
  }
  const remap = new Map<string, string>();
  const nodes = new Map<string, SpatialGraphJSON['nodes'][number]>();
  const report: LegacyReport = { mergedNodes: 0, collapsedEdges: 0, mergedEdges: 0 };
  for (const raw of array(data.nodes).sort((a, b) =>
    compareKeys(key(dictionary(a).key), key(dictionary(b).key)),
  )) {
    const node = dictionary(raw);
    const original = key(node.key);
    const exact = parseKey(original);
    const point = canonicalPoint(exact, options.coordinatePrecision);
    const canonical = pointKey(point);
    if (remap.has(original)) {
      throw new Error('Duplicate legacy node key.');
    }
    const attributes = dictionary(node.attributes ?? {});
    if (
      (attributes.x !== undefined && attributes.x !== exact[0]) ||
      (attributes.y !== undefined && attributes.y !== exact[1])
    ) {
      throw new Error('Legacy coordinate attributes disagree with the node key.');
    }
    const winner = nodes.get(canonical);
    nodes.set(canonical, {
      key: canonical,
      point,
      attributes: winner ? { ...attributes, ...winner.attributes } : copyData(attributes),
    });
    remap.set(original, canonical);
    if (winner) {
      report.mergedNodes++;
    }
  }
  const edges = new Map<string, SpatialGraphJSON['edges'][number]>();
  const edgeKeys = new Set<string>();
  for (const raw of array(data.edges)) {
    const edge = dictionary(raw);
    const edgeKey = key(edge.key);
    const originalSource = key(edge.source);
    const originalTarget = key(edge.target);
    if (edge.undirected === false || originalSource === originalTarget) {
      throw new Error('Legacy directed edges/self-loops are unsupported.');
    }
    if (edgeKeys.has(edgeKey)) {
      throw new Error('Duplicate legacy edge key.');
    }
    edgeKeys.add(edgeKey);
    const source = remap.get(originalSource);
    const target = remap.get(originalTarget);
    if (!source || !target) {
      throw new Error('Legacy edge has a missing endpoint.');
    }
    if (source === target) {
      report.collapsedEdges++;
      continue;
    }
    const pair = pairKey(source, target);
    const attributes = dictionary(edge.attributes ?? {});
    const winner = edges.get(pair);
    if (winner) {
      winner.attributes = { ...attributes, ...winner.attributes };
      report.mergedEdges++;
    } else {
      edges.set(pair, { key: edgeKey, source, target, attributes: copyData(attributes) });
    }
  }
  const result: SpatialGraphJSON<NodeAttributes, EdgeAttributes> = {
    schema: 'spatial-graph',
    version: 2,
    options: {
      coordinatePrecision: options.coordinatePrecision,
      positionTolerance: options.positionTolerance ?? 1e-9,
      straightAngleToleranceDeg: 1e-7,
    },
    attributes: copyData(dictionary(data.attributes ?? {})),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
  return { data: decodeGraphJSON(result), report };
}
