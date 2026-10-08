import { readFileSync } from 'node:fs';
import { Point, Segment } from '@flatten-js/core';
import { SpatialGraph } from '../../../index.js';
import type { EdgeAttributes, NxEdge, NxPoint } from '../../../index.js';

/**
 * Test-side copy of how the single consuming project (a graph editor) loads and
 * stores its network. It exists so the baseline tests exercise the library the
 * same way the consumer does, and so Phase 1+ can swap these two functions for
 * the new API and compare against the same expectations.
 *
 * The consumer stores a graphology-shaped JSON of its own, not the library's
 * `export()`: edge geometry lives in `attributes.coords`, the edge width in
 * `attributes.corridor_width`, labels in `attributes.label`, and the next free
 * label indexes in the graph-level `attributes`.
 */
export interface StoredNetwork {
  attributes?: Record<string, unknown>;
  nodes?: Array<{ key: string; attributes: { x: number; y: number; label?: string } }>;
  edges: Array<{
    key: string;
    source?: string;
    target?: string;
    attributes: { coords: Array<[number, number]>; corridor_width?: number; label?: string };
  }>;
}

export const DEFAULT_WIDTH = 140;
export const NEXT_NODE_LABEL_INDEX = 'nextNodeLabelIndex';
export const NEXT_EDGE_LABEL_INDEX = 'nextEdgeLabelIndex';

export function readFixture<T = StoredNetwork>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;
}

/** Load a stored network the way the consumer does: one segment per coordinate pair. */
export function loadStored(stored: StoredNetwork): SpatialGraph {
  const segments: Segment[] = [];
  const attrs: Array<Record<string, unknown>> = [];

  for (const edge of stored.edges) {
    const { coords, corridor_width: rawWidth, label } = edge.attributes;
    if (coords.length < 2) continue;
    const width = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : DEFAULT_WIDTH;

    for (let i = 0; i < coords.length - 1; i += 1) {
      const [x1, y1] = coords[i]!;
      const [x2, y2] = coords[i + 1]!;
      segments.push(new Segment(new Point(x1, y1), new Point(x2, y2)));
      attrs.push({
        type: 'skeleton',
        key: edge.key,
        width,
        ...(i === 0 && label ? { label } : {}),
      });
    }
  }

  const graph = new SpatialGraph({ segments, attrs });

  for (const node of stored.nodes ?? []) {
    const { x, y, label } = node.attributes;
    if (label && Number.isFinite(x) && Number.isFinite(y)) graph.setNodeLabel([x, y], label);
  }
  for (const attribute of [NEXT_NODE_LABEL_INDEX, NEXT_EDGE_LABEL_INDEX]) {
    const value = stored.attributes?.[attribute];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      graph.setAttribute(attribute, value);
    }
  }

  return graph;
}

/** Store a network the way the consumer does (`toGraphology`). */
export function toStored(graph: SpatialGraph): Required<StoredNetwork> {
  const nodes = graph.getNodes().map((point) => {
    const label = graph.getNodeLabel(point);
    return {
      key: graph.getPointKey(point),
      attributes: { x: point[0], y: point[1], ...(label ? { label } : {}) },
    };
  });

  const edges = graph.getEdges().map((edge, index) => {
    const attrs = graph.getEdgeAttributesFor(edge);
    const stored = attrs?.width;
    const width = typeof stored === 'number' && stored > 0 ? stored : DEFAULT_WIDTH;
    const label = graph.getEdgeLabel(edge);
    return {
      key: attrs?.key != null ? String(attrs.key) : `edge-${index}`,
      source: graph.getPointKey(edge[0]),
      target: graph.getPointKey(edge[1]),
      attributes: {
        coords: [
          [edge[0][0], edge[0][1]] as [number, number],
          [edge[1][0], edge[1][1]] as [number, number],
        ],
        corridor_width: width,
        ...(label ? { label } : {}),
      },
    };
  });

  const attributes: Record<string, unknown> = {};
  for (const attribute of [NEXT_NODE_LABEL_INDEX, NEXT_EDGE_LABEL_INDEX]) {
    const value = graph.getAttribute(attribute);
    if (typeof value === 'number') attributes[attribute] = value;
  }

  return { attributes, nodes, edges };
}

/**
 * Give every node and edge a stable in-memory `id` (the editor keeps selection
 * across coordinate changes with these). Ids are not stored.
 */
export function ensureEditingIds(graph: SpatialGraph): void {
  graph.forEachNode((key, attrs) => {
    if (!attrs.id) graph.setNodeAttribute(key, 'id', key);
  });
  graph.forEachEdge((key, _attrs, source, target) => {
    if (!graph.getEdgeAttribute(key, 'id')) {
      graph.setEdgeAttribute(key, 'id', source < target ? `${source}|${target}` : `${target}|${source}`);
    }
  });
}

/** Order-independent text form of an edge, for assertions. */
export function edgeId(edge: NxEdge): string {
  const [a, b] = edge.map((p) => `${p[0]},${p[1]}`) as [string, string];
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function pointId(point: NxPoint): string {
  return `${point[0]},${point[1]}`;
}

/** Sorted edge ids with their widths and labels: a compact snapshot of a graph. */
export function describeEdges(graph: SpatialGraph): string[] {
  return graph
    .getEdges()
    .map((edge) => {
      const attrs = graph.getEdgeAttributesFor(edge) as EdgeAttributes;
      return `${edgeId(edge)} w=${attrs.width} ${attrs.label ?? '-'}`;
    })
    .sort();
}
