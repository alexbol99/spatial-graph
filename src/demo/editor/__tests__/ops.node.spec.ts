import { describe, expect, it } from 'vitest';
import { insertVertex, pruneIsolated, removeEdges, removeVertex } from '../ops.js';
import { graphFromEdges } from '../sample.js';
import { widthOf } from '../util.js';

describe('insertVertex', () => {
  it('splits an edge and both halves keep its width', () => {
    const g = graphFromEdges([[[0, 0], [400, 0], 120]]);
    expect(insertVertex(g, [[0, 0], [400, 0]], [150, 0])).toEqual([150, 0]);
    expect(g.size).toBe(2);
    expect(widthOf(g, [[0, 0], [150, 0]])).toBe(120);
    expect(widthOf(g, [[150, 0], [400, 0]])).toBe(120);
  });

  it('does nothing at an endpoint or for a missing edge', () => {
    const g = graphFromEdges([[[0, 0], [400, 0], 120]]);
    expect(insertVertex(g, [[0, 0], [400, 0]], [0, 0])).toBeNull();
    expect(insertVertex(g, [[0, 0], [300, 0]], [150, 0])).toBeNull();
    expect(g.size).toBe(1);
  });
});

describe('removeVertex', () => {
  it('removes a dead end with its edge', () => {
    const g = graphFromEdges([[[0, 0], [400, 0], 120], [[400, 0], [400, 300], 120]]);
    expect(removeVertex(g, [400, 300])).toEqual({ removed: true });
    expect(g.size).toBe(1);
    expect(g.hasPointNode([400, 300])).toBe(false);
  });

  it('joins the neighbours of a pass-through vertex, keeping the wider width', () => {
    const g = graphFromEdges([[[0, 0], [200, 0], 100], [[200, 0], [400, 0], 160]]);
    expect(removeVertex(g, [200, 0])).toEqual({ removed: true });
    expect(g.size).toBe(1);
    expect(widthOf(g, [[0, 0], [400, 0]])).toBe(160);
  });

  it('refuses when the neighbours are already connected', () => {
    const g = graphFromEdges([
      [[0, 0], [200, 0], 100],
      [[200, 0], [400, 0], 100],
      [[0, 0], [400, 0], 100],
    ]);
    const result = removeVertex(g, [200, 0]);
    expect(result.removed).toBe(false);
    expect(g.size).toBe(3);
  });

  it('refuses a junction and says how to proceed', () => {
    const g = graphFromEdges([
      [[0, 0], [200, 0], 100],
      [[200, 0], [400, 0], 100],
      [[200, 0], [200, 200], 100],
    ]);
    const result = removeVertex(g, [200, 0]);
    expect(result).toMatchObject({ removed: false });
    expect(result.removed === false && result.reason).toContain('Delete some of its edges');
    expect(g.size).toBe(3);
  });

  it('reports a missing vertex', () => {
    expect(removeVertex(graphFromEdges([[[0, 0], [10, 0], 100]]), [5, 5]).removed).toBe(false);
  });
});

describe('removeEdges', () => {
  it('prunes isolated nodes but keeps dead ends', () => {
    const g = graphFromEdges([[[0, 0], [200, 0], 100], [[200, 0], [400, 0], 100]]);
    removeEdges(g, [[[0, 0], [200, 0]]]);
    expect(g.hasPointNode([0, 0])).toBe(false);
    expect(g.isStub([200, 0])).toBe(true);
    expect(g.size).toBe(1);
  });

  it('pruneIsolated clears nodes without edges', () => {
    const g = graphFromEdges([[[0, 0], [200, 0], 100]]);
    g.addVertex([50, 50]);
    pruneIsolated(g);
    expect(g.order).toBe(2);
  });
});
