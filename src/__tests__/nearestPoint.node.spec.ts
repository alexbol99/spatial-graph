import { describe, expect, it } from 'vitest';
import {
  edgeParameterAt,
  nearestPointOnSegment,
  nearestPointOnSegments,
  pointAtEdgeParameter,
} from '../utils/projection.js';
import type { NxEdge } from '../types.js';

const H: NxEdge = [
  [0, 0],
  [100, 0],
];

describe('nearestPointOnSegment', () => {
  it('projects onto the segment interior', () => {
    const result = nearestPointOnSegment([40, 30], H);
    expect(result.point).toEqual([40, 0]);
    expect(result.distance).toBeCloseTo(30);
    expect(result.t).toBeCloseTo(0.4);
    expect(result.clamped).toBe(false);
  });

  it('clamps past the end and flags it', () => {
    const result = nearestPointOnSegment([160, 0], H);
    expect(result.point).toEqual([100, 0]);
    expect(result.distance).toBeCloseTo(60);
    expect(result.t).toBe(1);
    expect(result.clamped).toBe(true);
  });

  it('clamps before the start and flags it', () => {
    const result = nearestPointOnSegment([-30, 40], H);
    expect(result.point).toEqual([0, 0]);
    expect(result.distance).toBeCloseTo(50);
    expect(result.t).toBe(0);
    expect(result.clamped).toBe(true);
  });

  it('does not call a foot landing exactly on an endpoint clamped', () => {
    // The foot is on the segment and the offset is still perpendicular to it, so
    // callers requiring a true perpendicular must not discard this.
    const result = nearestPointOnSegment([0, 25], H);
    expect(result.point).toEqual([0, 0]);
    expect(result.clamped).toBe(false);
  });

  it('handles a degenerate edge as a single point', () => {
    const degenerate: NxEdge = [
      [10, 10],
      [10, 10],
    ];
    const result = nearestPointOnSegment([13, 14], degenerate);
    expect(result.point).toEqual([10, 10]);
    expect(result.distance).toBeCloseTo(5);
    expect(result.clamped).toBe(true);
  });

  it('measures perpendicular distance for a diagonal edge', () => {
    const diagonal: NxEdge = [
      [0, 0],
      [100, 100],
    ];
    const result = nearestPointOnSegment([50, 0], diagonal);
    expect(result.point[0]).toBeCloseTo(25);
    expect(result.point[1]).toBeCloseTo(25);
    expect(result.distance).toBeCloseTo(Math.hypot(25, 25));
  });
});

describe('nearestPointOnSegments', () => {
  const near: NxEdge = [
    [0, 50],
    [100, 50],
  ];
  const far: NxEdge = [
    [0, 400],
    [100, 400],
  ];

  it('returns the closest segment with its index', () => {
    const result = nearestPointOnSegments([50, 0], [far, near]);
    expect(result?.index).toBe(1);
    expect(result?.distance).toBeCloseTo(50);
  });

  it('returns null for an empty set', () => {
    expect(nearestPointOnSegments([0, 0], [])).toBeNull();
  });

  it('keeps the first of two equidistant segments', () => {
    const above: NxEdge = [
      [0, 10],
      [100, 10],
    ];
    const below: NxEdge = [
      [0, -10],
      [100, -10],
    ];
    expect(nearestPointOnSegments([50, 0], [above, below])?.index).toBe(0);
  });
});

describe('edgeParameterAt / pointAtEdgeParameter', () => {
  it('round-trips a position along an edge', () => {
    const t = edgeParameterAt(H, [30, 12]);
    expect(t).toBeCloseTo(0.3);
    expect(pointAtEdgeParameter(H, t)).toEqual([30, 0]);
  });

  it('restores the same fraction after the edge has moved', () => {
    const t = edgeParameterAt(H, [25, 0]);
    const moved: NxEdge = [
      [0, 200],
      [100, 200],
    ];
    expect(pointAtEdgeParameter(moved, t)).toEqual([25, 200]);
  });

  it('clamps the parameter to the edge', () => {
    expect(pointAtEdgeParameter(H, -1)).toEqual([0, 0]);
    expect(pointAtEdgeParameter(H, 2)).toEqual([100, 0]);
  });
});
