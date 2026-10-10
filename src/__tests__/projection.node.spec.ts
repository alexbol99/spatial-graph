import { expect, it } from 'vitest';
import { projectPoint } from '../utils/projection.js';
it('projects interior points and clamps only points outside the segment', () => {
  const segment = [
    [0, 0],
    [10, 0],
  ] as const;
  expect(projectPoint([4, 3], segment)).toEqual({
    point: [4, 0],
    distance: 3,
    t: 0.4,
    clamped: false,
  });
  expect(projectPoint([-1, 0], segment)).toEqual({
    point: [0, 0],
    distance: 1,
    t: 0,
    clamped: true,
  });
  expect(projectPoint([11, 0], segment)).toEqual({
    point: [10, 0],
    distance: 1,
    t: 1,
    clamped: true,
  });
  expect(projectPoint([0, 2], segment).clamped).toBe(false);
  expect(
    projectPoint(
      [2, 2],
      [
        [1, 1],
        [1, 1],
      ],
    ),
  ).toMatchObject({ point: [1, 1], t: 0, clamped: false });
});

it('clamps representable endpoint projections without overflowing the parameter', () => {
  const result = projectPoint(
    [1, 0],
    [
      [0, 0],
      [Number.MIN_VALUE, 0],
    ],
  );
  expect(result.point).toEqual([Number.MIN_VALUE, 0]);
  expect(result.t).toBe(1);
  expect(result.clamped).toBe(true);
  expect(result.distance).toBe(1);
});
