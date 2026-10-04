import { describe, expect, it } from 'vitest';
import { commitNewEdge, planNewEdge, resolveDrawStart, type DrawStart } from '../draw.js';
import { graphFromEdges } from '../sample.js';
import { widthOf } from '../util.js';

const base = () => graphFromEdges([[[0, 0], [800, 0], 100]]);
const free = (at: [number, number]): DrawStart => ({ at, width: 140, on: 'free' });

describe('resolveDrawStart', () => {
  it('takes the width of the edge it starts on or at', () => {
    const g = base();
    expect(resolveDrawStart(g, { kind: 'vertex', at: [0, 0] }, [0, 0])).toMatchObject({
      on: 'vertex',
      width: 100,
    });
    expect(
      resolveDrawStart(g, { kind: 'body', edge: [[0, 0], [800, 0]], at: [300, 0] }, [300, 20]),
    ).toMatchObject({ on: 'edge', at: [300, 0], width: 100 });
  });

  it('uses the default width in empty space', () => {
    expect(resolveDrawStart(base(), { kind: 'empty' }, [50, 50])).toEqual({
      at: [50, 50],
      width: 140,
      on: 'free',
    });
  });
});

describe('planNewEdge', () => {
  it('plans a chain through each crossing, in order', () => {
    const g = graphFromEdges([
      [[0, 0], [800, 0], 100],
      [[0, 200], [800, 200], 100],
    ]);
    const plan = planNewEdge(g, free([400, -200]), [400, 400], 1);
    expect(plan.valid).toBe(true);
    expect(plan.points).toEqual([[400, -200], [400, 0], [400, 200], [400, 400]]);
  });

  it('snaps its end to an edge', () => {
    const plan = planNewEdge(base(), free([400, -200]), [400, 4], 1);
    expect(plan.end).toMatchObject({ kind: 'edge', point: [400, 0] });
    expect(plan.points).toEqual([[400, -200], [400, 0]]);
  });

  it('snaps its end to a vertex', () => {
    const plan = planNewEdge(base(), free([400, -200]), [797, 5], 1);
    expect(plan.end).toMatchObject({ kind: 'vertex', point: [800, 0] });
  });

  it('is invalid when too short', () => {
    expect(planNewEdge(base(), free([400, -200]), [403, -197], 1).valid).toBe(false);
  });

  it('does not change the graph', () => {
    const g = base();
    planNewEdge(g, free([400, -200]), [400, 400], 1);
    expect(g.size).toBe(1);
  });
});

describe('commitNewEdge', () => {
  it('adds a chain and splits what it crosses', () => {
    const g = base();
    const plan = planNewEdge(g, free([400, -200]), [400, 200], 1);
    expect(commitNewEdge(g, plan)).toBe(true);
    expect(g.getPointDegree([400, 0])).toBe(4);
    expect(g.size).toBe(4);
    expect(widthOf(g, [[400, -200], [400, 0]])).toBe(140);
    expect(widthOf(g, [[0, 0], [400, 0]])).toBe(100);
  });

  it('splits the edge it starts on', () => {
    const g = base();
    const start = resolveDrawStart(g, { kind: 'body', edge: [[0, 0], [800, 0]], at: [200, 0] }, [200, 5]);
    const plan = planNewEdge(g, start, [200, 300], 1);
    commitNewEdge(g, plan);
    expect(g.getPointDegree([200, 0])).toBe(3);
    expect(widthOf(g, [[200, 0], [200, 300]])).toBe(100);
  });

  it('splits the edge it ends on', () => {
    const g = base();
    commitNewEdge(g, planNewEdge(g, free([400, -200]), [400, 4], 1));
    expect(g.getPointDegree([400, 0])).toBe(3);
  });

  it('does nothing for an invalid plan', () => {
    const g = base();
    expect(commitNewEdge(g, planNewEdge(g, free([400, -200]), [402, -199], 1))).toBe(false);
    expect(g.size).toBe(1);
  });
});
