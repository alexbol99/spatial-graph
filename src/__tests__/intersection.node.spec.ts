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

    it('finds crossings that are off the coordinate grid', () => {
      // The exact crossing is [5.5, 5.5]; the returned point is snapped to the grid
      expect(
        findIntersection(
          [
            [0, 0],
            [11, 11],
          ],
          [
            [0, 11],
            [11, 0],
          ],
        ),
      ).toEqual([6, 6]);
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

    it('accepts endpoints', () => {
      const segment = new Segment(new Point(0, 0), new Point(10, 0));

      expect(isPointOnSegment([0, 0], segment)).toBe(true);
      expect(isPointOnSegment([10, 0], segment)).toBe(true);
    });

    it('rejects a point near an endpoint that is not on the segment', () => {
      const segment = new Segment(new Point(0, 0), new Point(10, 0));

      expect(isPointOnSegment([0.4, 0.4], segment)).toBe(false);
    });
  });
});
