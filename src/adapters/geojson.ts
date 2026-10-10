import type {
  EdgeRecord,
  GeoJSONCollection,
  NodeAttributes,
  Point2D,
  SpatialGraphJSON,
} from '../types.js';
import { canonicalPoint } from '../internal/coordinates.js';
import { dictionary } from './serialization.js';

/** Geometry decoding is complete before any graph is created. */
export function decodeGeoJSON(input: unknown, options: { dropExtraDimensions?: boolean }) {
  const data = dictionary(input);
  const features =
    data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : null;
  if (!Array.isArray(features)) {
    throw new TypeError('GeoJSON must be a Feature or FeatureCollection.');
  }
  const edges: EdgeRecord[] = [];
  const nodes: Array<{ point: Point2D; attributes: NodeAttributes }> = [];

  const point = (input: unknown): Point2D => {
    if (
      !Array.isArray(input) ||
      input.length < 2 ||
      (!options.dropExtraDimensions && input.length !== 2)
    ) {
      throw new Error(
        'GeoJSON coordinates must have two dimensions; set dropExtraDimensions to discard extra dimensions.',
      );
    }
    return canonicalPoint([input[0], input[1]], null);
  };

  for (const raw of features) {
    const feature = dictionary(raw);
    if (feature.type !== 'Feature') {
      throw new Error('Expected a GeoJSON Feature.');
    }
    const geometry = dictionary(feature.geometry);
    const attributes = feature.properties === null ? {} : dictionary(feature.properties);
    if (geometry.type === 'Point') {
      nodes.push({ point: point(geometry.coordinates), attributes });
      continue;
    }
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : null;
    if (!Array.isArray(lines)) {
      throw new Error('Supported GeoJSON geometry: Point, LineString, MultiLineString.');
    }
    for (const rawLine of lines) {
      if (!Array.isArray(rawLine) || rawLine.length < 2) {
        throw new Error('A LineString must contain at least two positions.');
      }
      const line = rawLine.map(point);
      for (let i = 1; i < line.length; i++) {
        edges.push({ endpoints: [line[i - 1]!, line[i]!], attributes: { ...attributes } });
      }
    }
  }
  return { edges, nodes };
}

export function encodeGeoJSON<N extends object, E extends object>(
  data: SpatialGraphJSON<N, E>,
): GeoJSONCollection {
  const nodes = new Map(data.nodes.map((node) => [node.key, node]));
  const used = new Set<string>();
  const features: GeoJSONCollection['features'] = data.edges.map((edge) => {
    used.add(edge.source);
    used.add(edge.target);
    return {
      type: 'Feature',
      properties: { ...edge.attributes } as Record<string, unknown>,
      geometry: {
        type: 'LineString',
        coordinates: [nodes.get(edge.source)!.point, nodes.get(edge.target)!.point],
      },
    };
  });
  for (const node of data.nodes) {
    if (!used.has(node.key)) {
      features.push({
        type: 'Feature',
        properties: { ...node.attributes } as Record<string, unknown>,
        geometry: { type: 'Point', coordinates: node.point },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
