import { Point, Segment } from '@flatten-js/core';
import { describe, expect, it } from 'vitest';
import { findIntersection, findLineIntersection, isPointOnSegment } from '../utils/intersection.js';

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

  describe('findLineIntersection', () => {
    it('intersects the lines through the edges, beyond their ends', () => {
      expect(
        findLineIntersection(
          [
            [0, 0],
            [1, 0],
          ],
          [
            [5, 1],
            [5, 2],
          ],
        ),
      ).toEqual([5, 0]);
    });

    it('returns the exact point without snapping to the grid', () => {
      expect(
        findLineIntersection(
          [
            [0, 0],
            [1, 1],
          ],
          [
            [0, 1],
            [1, 0],
          ],
        ),
      ).toEqual([0.5, 0.5]);
    });

    it('returns null when checkPointOnEdge is set and the point is off an edge', () => {
      expect(
        findLineIntersection(
          [
            [0, 0],
            [1, 0],
          ],
          [
            [5, 1],
            [5, 2],
          ],
          true,
        ),
      ).toBeNull();
    });

    it('returns null for parallel, coincident and zero-length edges', () => {
      const edge: [[number, number], [number, number]] = [
        [0, 0],
        [10, 0],
      ];

      expect(
        findLineIntersection(edge, [
          [0, 5],
          [10, 5],
        ]),
      ).toBeNull();
      expect(
        findLineIntersection(edge, [
          [2, 0],
          [4, 0],
        ]),
      ).toBeNull();
      expect(
        findLineIntersection(edge, [
          [3, 3],
          [3, 3],
        ]),
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
