import { expect, it } from 'vitest';
import { canonicalPoint } from '../internal/coordinates.js';
import { angleDegrees, distance, vector } from '../utils/geometry.js';
import { intersectSegments } from '../utils/intersection.js';
it('normalizes graph coordinates and negative zero independently of pure geometry', () => {
  expect(canonicalPoint([1.234, -0], 2)).toEqual([1.23, 0]); expect(canonicalPoint([-1.6, 2.1], 0)).toEqual([-2, 2]);
  expect(canonicalPoint([0.1, 0.2], null)).toEqual([0.1, 0.2]);
  expect(() => canonicalPoint([Infinity, 0], null)).toThrow();
  expect(() => canonicalPoint([1e308, 0], 2)).toThrow();
});
it('calculates robust angles and distances without Flatten allocation', () => {
  expect(angleDegrees([1, 0], [0, 1])).toBe(90); expect(angleDegrees([1e200, 0], [-1e200, 0])).toBe(180);
  expect(distance([0, 0], [3, 4])).toBe(5); expect(vector([1, 2], [3, 5])).toEqual([2, 3]);
});
it('distinguishes crossings, touches, overlaps, disjoint and reversed segments', () => {
  expect(intersectSegments([[0, 0], [2, 2]], [[0, 2], [2, 0]])).toEqual({ type: 'point', point: [1, 1] });
  expect(intersectSegments([[0, 0], [2, 0]], [[1, 0], [3, 0]])).toEqual({ type: 'overlap', endpoints: [[1, 0], [2, 0]] });
  expect(intersectSegments([[0, 0], [2, 0]], [[2, 0], [0, 0]])).toEqual({ type: 'overlap', endpoints: [[0, 0], [2, 0]] });
  expect(intersectSegments([[0, 0], [2, 0]], [[2, 0], [2, 2]])).toEqual({ type: 'point', point: [2, 0] });
  expect(intersectSegments([[0, 0], [2, 0]], [[0, 1], [2, 1]])).toEqual({ type: 'none' });
});
