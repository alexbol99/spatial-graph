import { describe, it, expect } from 'vitest';
import { Point, Segment } from '@flatten-js/core';
import {
  roundPoint,
  toFlattenPoint,
  fromFlattenPoint,
  toFlattenSegment,
  fromFlattenSegment,
  getPointDistance,
  getLinesAngleByCross,
  getLinesDot,
  hasValidLength,
  pointsEqual,
  edgesEqual,
  simplifyPolylinePath,
} from '../utils/geometry.js';
import type { NxPoint, NxEdge } from '../types.js';

describe('geometry utilities', () => {
  describe('roundPoint', () => {
    it('should round point coordinates to precision', () => {
      const point: NxPoint = [1.6, 2.4];
      const rounded = roundPoint(point);
      expect(rounded).toEqual([2, 2]);
    });

    it('should handle negative coordinates', () => {
      const point: NxPoint = [-1.6, -2.4];
      const rounded = roundPoint(point);
      expect(rounded).toEqual([-2, -2]);
    });
  });

  describe('toFlattenPoint and fromFlattenPoint', () => {
    it('should convert NxPoint to flatten-js Point', () => {
      const nxPoint: NxPoint = [3, 4];
      const flattenPoint = toFlattenPoint(nxPoint);

      expect(flattenPoint).toBeInstanceOf(Point);
      expect(flattenPoint.x).toBe(3);
      expect(flattenPoint.y).toBe(4);
    });

    it('should convert flatten-js Point to NxPoint', () => {
      const flattenPoint = new Point(3, 4);
      const nxPoint = fromFlattenPoint(flattenPoint);

      expect(nxPoint).toEqual([3, 4]);
    });

    it('should round-trip correctly', () => {
      const original: NxPoint = [5, 7];
      const converted = fromFlattenPoint(toFlattenPoint(original));
      expect(converted).toEqual(original);
    });
  });

  describe('toFlattenSegment and fromFlattenSegment', () => {
    it('should convert NxEdge to flatten-js Segment', () => {
      const edge: NxEdge = [
        [0, 0],
        [1, 1],
      ];
      const segment = toFlattenSegment(edge);

      expect(segment).toBeInstanceOf(Segment);
      expect(segment.start.x).toBe(0);
      expect(segment.start.y).toBe(0);
      expect(segment.end.x).toBe(1);
      expect(segment.end.y).toBe(1);
    });

    it('should convert flatten-js Segment to NxEdge', () => {
      const segment = new Segment(new Point(0, 0), new Point(1, 1));
      const edge = fromFlattenSegment(segment);

      expect(edge).toEqual([
        [0, 0],
        [1, 1],
      ]);
    });

    it('should round-trip correctly', () => {
      const original: NxEdge = [
        [2, 3],
        [5, 7],
      ];
      const converted = fromFlattenSegment(toFlattenSegment(original));
      expect(converted).toEqual(original);
    });
  });

  describe('getPointDistance', () => {
    it('should return Euclidean distance between points', () => {
      expect(getPointDistance([0, 0], [3, 4])).toBe(5);
    });
  });

  describe('getLinesAngleByCross', () => {
    it('should calculate 90 degree angle for perpendicular lines', () => {
      const seg1 = new Segment(new Point(0, 0), new Point(1, 0)); // horizontal
      const seg2 = new Segment(new Point(0, 0), new Point(0, 1)); // vertical

      const angle = getLinesAngleByCross(seg1, seg2);

      expect(angle).toBeCloseTo(90, 1);
    });

    it('should calculate 0 degree angle for parallel lines', () => {
      const seg1 = new Segment(new Point(0, 0), new Point(1, 0));
      const seg2 = new Segment(new Point(0, 1), new Point(1, 1));

      const angle = getLinesAngleByCross(seg1, seg2);

      expect(angle).toBeCloseTo(0, 1);
    });

    it('should calculate 45 degree angle for diagonal lines', () => {
      const seg1 = new Segment(new Point(0, 0), new Point(1, 0)); // horizontal
      const seg2 = new Segment(new Point(0, 0), new Point(1, 1)); // 45 degrees

      const angle = getLinesAngleByCross(seg1, seg2);

      expect(angle).toBeCloseTo(45, 1);
    });
  });

  describe('getLinesDot', () => {
    it('should calculate dot product of segments', () => {
      const seg1 = new Segment(new Point(0, 0), new Point(1, 0));
      const seg2 = new Segment(new Point(0, 0), new Point(0, 1));

      const dot = getLinesDot(seg1, seg2);

      // Perpendicular vectors have dot product of 0
      expect(dot).toBeCloseTo(0, 5);
    });

    it('should calculate positive dot for same direction', () => {
      const seg1 = new Segment(new Point(0, 0), new Point(1, 0));
      const seg2 = new Segment(new Point(0, 0), new Point(2, 0));

      const dot = getLinesDot(seg1, seg2);

      expect(dot).toBeGreaterThan(0);
    });
  });

  describe('hasValidLength', () => {
    it('should return true for non-zero length segment', () => {
      const segment = new Segment(new Point(0, 0), new Point(1, 0));
      expect(hasValidLength(segment)).toBe(true);
    });

    it('should return false for zero length segment', () => {
      const segment = new Segment(new Point(0, 0), new Point(0, 0));
      expect(hasValidLength(segment)).toBe(false);
    });
  });

  describe('pointsEqual', () => {
    it('should return true for equal points', () => {
      const p1: NxPoint = [1, 2];
      const p2: NxPoint = [1, 2];
      expect(pointsEqual(p1, p2)).toBe(true);
    });

    it('should return false for different points', () => {
      const p1: NxPoint = [1, 2];
      const p2: NxPoint = [3, 4];
      expect(pointsEqual(p1, p2)).toBe(false);
    });

    it('should consider rounding when comparing', () => {
      const p1: NxPoint = [1.4, 2.4];
      const p2: NxPoint = [1.6, 2.6];
      // Both round to [1, 2] and [2, 3] respectively with precision 0
      expect(pointsEqual(p1, p2)).toBe(false);
    });
  });

  describe('edgesEqual', () => {
    it('should return true for equal edges', () => {
      const e1: NxEdge = [
        [0, 0],
        [1, 1],
      ];
      const e2: NxEdge = [
        [0, 0],
        [1, 1],
      ];
      expect(edgesEqual(e1, e2)).toBe(true);
    });

    it('should return true for reversed edges', () => {
      const e1: NxEdge = [
        [0, 0],
        [1, 1],
      ];
      const e2: NxEdge = [
        [1, 1],
        [0, 0],
      ];
      expect(edgesEqual(e1, e2)).toBe(true);
    });

    it('should return false for different edges', () => {
      const e1: NxEdge = [
        [0, 0],
        [1, 1],
      ];
      const e2: NxEdge = [
        [0, 0],
        [2, 2],
      ];
      expect(edgesEqual(e1, e2)).toBe(false);
    });
  });

  describe('simplifyPolylinePath', () => {
    it('should remove points within the RDP tolerance', () => {
      const path: NxPoint[] = [
        [0, 0],
        [50, 2],
        [100, 0],
      ];

      expect(simplifyPolylinePath(path, 8)).toEqual([
        [0, 0],
        [100, 0],
      ]);
    });

    it('should keep points outside the RDP tolerance', () => {
      const path: NxPoint[] = [
        [0, 0],
        [50, 20],
        [100, 0],
      ];

      expect(simplifyPolylinePath(path, 8)).toEqual([
        [0, 0],
        [50, 20],
        [100, 0],
      ]);
    });
  });
});
