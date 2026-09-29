import { Point, Segment } from '@flatten-js/core';
import { describe, expect, it } from 'vitest';
import { findIntersection, isPointOnSegment } from '../utils/intersection.js';

describe('intersection utilities', () => {
  describe('findIntersection', () => {
    it('returns the intersection point for crossing edges', () => {
      expect(
        findIntersection(
          [
            [0, 0],
            [10, 0],
          ],
          [
            [5, -5],
            [5, 5],
          ],
        ),
      ).toEqual([5, 0]);
    });

    it('returns null for overlapping collinear edges', () => {
      expect(
        findIntersection(
          [
            [0, 0],
            [10, 0],
          ],
          [
            [5, 0],
            [15, 0],
          ],
        ),
      ).toBeNull();
    });
  });

  describe('isPointOnSegment', () => {
    it('detects a point on a segment', () => {
      const segment = new Segment(new Point(0, 0), new Point(10, 0));

      expect(isPointOnSegment([5, 0], segment)).toBe(true);
    });
  });
});
