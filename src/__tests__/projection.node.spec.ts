import { describe, it, expect } from 'vitest';
import { Point, Segment } from '@flatten-js/core';
import { projectPointOnSegment } from '../utils/projection.js';

describe('projection utilities', () => {
  describe('projectPointOnSegment', () => {
    const segment = new Segment(new Point(0, 0), new Point(10, 0));

    it('should project points onto the segment interior', () => {
      expect(projectPointOnSegment([4, 3], segment)).toEqual([4, 0]);
    });

    it('should clamp projections before the segment start', () => {
      expect(projectPointOnSegment([-3, 2], segment)).toEqual([0, 0]);
    });

    it('should clamp projections after the segment end', () => {
      expect(projectPointOnSegment([14, -2], segment)).toEqual([10, 0]);
    });

    it('should preserve endpoint projections', () => {
      expect(projectPointOnSegment([0, 5], segment)).toEqual([0, 0]);
      expect(projectPointOnSegment([10, -5], segment)).toEqual([10, 0]);
    });
  });
});
