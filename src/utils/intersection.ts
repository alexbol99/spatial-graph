import type { IntersectionResult, Point2D, Segment2D } from '../types.js';
import { cross, distance, vector } from './geometry.js';
import { projectPoint } from './projection.js';
/** Intersect straight segments; tolerance controls containment, not graph identity. */
export function intersectSegments(first: Segment2D, second: Segment2D, tolerance = 0): IntersectionResult {
  const [a, b] = first, [c, d] = second;
  const r = vector(a, b), s = vector(c, d), offset = vector(a, c);
  const scale = Math.max(Math.abs(r[0]), Math.abs(r[1]), Math.abs(s[0]), Math.abs(s[1]));
  if (!scale) return distance(a, c) <= tolerance ? { type: 'point', point: a } : { type: 'none' };
  const nr: Point2D = [r[0] / scale, r[1] / scale], ns: Point2D = [s[0] / scale, s[1] / scale];
  const no: Point2D = [offset[0] / scale, offset[1] / scale];
  const denominator = cross(nr, ns);
  if (denominator !== 0) {
    const t = cross(no, ns) / denominator, u = cross(no, nr) / denominator;
    const slackA = tolerance / distance(a, b), slackB = tolerance / distance(c, d);
    if (t < -slackA || t > 1 + slackA || u < -slackB || u > 1 + slackB) return { type: 'none' };
    if (Math.abs(t) <= slackA) return { type: 'point', point: a };
    if (Math.abs(1 - t) <= slackA) return { type: 'point', point: b };
    if (Math.abs(u) <= slackB) return { type: 'point', point: c };
    if (Math.abs(1 - u) <= slackB) return { type: 'point', point: d };
    const clamped = Math.max(0, Math.min(1, t));
    return { type: 'point', point: [a[0] * (1 - clamped) + b[0] * clamped, a[1] * (1 - clamped) + b[1] * clamped] };
  }
  if (projectPoint(c, first).distance > tolerance && projectPoint(d, first).distance > tolerance
    && projectPoint(a, second).distance > tolerance && projectPoint(b, second).distance > tolerance) return { type: 'none' };
  const candidates = [a, b, c, d].filter((point) => projectPoint(point, first).distance <= tolerance && projectPoint(point, second).distance <= tolerance);
  const unique = candidates.filter((point, i) => candidates.findIndex((other) => distance(point, other) <= tolerance) === i);
  unique.sort((p, q) => projectPoint(p, first).t - projectPoint(q, first).t);
  if (!unique.length) return { type: 'none' };
  if (unique.length === 1) return { type: 'point', point: unique[0]! };
  return { type: 'overlap', endpoints: [unique[0]!, unique.at(-1)!] };
}
