import { Multiline, Segment } from '@flatten-js/core';
import type { EdgeRecord } from '../types.js';
/** Expand straight Flatten geometry only; validate every shape before graph insertion. */
export function flattenSegments<E extends object>(records: readonly { shape: unknown; attributes: E }[]): EdgeRecord<E>[] {
  return records.flatMap(({ shape, attributes }) => {
    const segments = shape instanceof Multiline ? shape.edges.map((edge) => edge.shape) : [shape];
    return segments.map((segment) => {
      if (!(segment instanceof Segment)) throw new TypeError('Only Flatten Segment or straight Multiline shapes are supported; approximate arcs explicitly before insertion.');
      return { endpoints: [[segment.start.x, segment.start.y], [segment.end.x, segment.end.y]], attributes };
    });
  });
}
