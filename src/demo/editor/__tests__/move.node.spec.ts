import { describe, expect, it } from 'vitest';
import { moveVertex, slideAlongNormal } from '../move.js';
import { graphFromEdges } from '../sample.js';

describe('moveVertex', () => {
  const build = () =>
    graphFromEdges([
      [[0, 0], [400, 0], 100],
      [[400, 0], [800, 0], 100],
      [[400, 0], [400, 300], 100],
    ]);

  it('moves freely and stretches the edges', () => {
    const g = build();
    const result = moveVertex(g, [400, 300], [450, 320], 1);
    expect(result.final).toEqual([450, 320]);
    expect(result.ring).toBeNull();
    expect(g.hasPointNode([450, 320])).toBe(true);
    expect(g.getPointNeighbors([450, 320])).toEqual([[400, 0]]);
  });

  it('collapses into a nearby vertex and rings it red', () => {
    const g = build();
    const result = moveVertex(g, [400, 300], [803, 4], 1);
    expect(result.final).toEqual([800, 0]);
    expect(result.ring).toEqual({ at: [800, 0], kind: 'collapse' });
    expect(g.hasPointNode([400, 300])).toBe(false);
    // The stub's edge to [400, 0] would duplicate the one that exists, so it merges into it.
    expect(g.getPointDegree([800, 0])).toBe(1);
    expect(g.getPointDegree([400, 0])).toBe(2);
    expect(g.size).toBe(2);
  });

  it('collapsing into a neighbour deletes the edge between them', () => {
    const g = build();
    moveVertex(g, [400, 300], [402, 3], 1);
    expect(g.hasPointNode([400, 300])).toBe(false);
    expect(g.getPointDegree([400, 0])).toBe(2);
    expect(g.size).toBe(2);
  });

  it('splits an edge it is not on and connects to the new vertex', () => {
    const g = graphFromEdges([
      [[0, 0], [800, 0], 100],
      [[400, 300], [400, 500], 100],
    ]);
    const result = moveVertex(g, [400, 300], [400, 6], 1);
    expect(result.final).toEqual([400, 0]);
    expect(result.ring).toEqual({ at: [400, 0], kind: 'snap' });
    expect(g.getPointDegree([400, 0])).toBe(3);
    expect(g.hasPointNode([400, 300])).toBe(false);
  });

  it('does not snap to its own edges', () => {
    const g = build();
    // Right beside the edge it hangs from: not a split target.
    const result = moveVertex(g, [400, 300], [406, 150], 1);
    expect(result.ring).toBeNull();
  });

  it('snaps further in world units when zoomed out', () => {
    const g = build();
    // 12 px at scale 0.1 reaches 120 units.
    expect(moveVertex(g, [400, 300], [800, 100], 0.1).final).toEqual([800, 0]);
  });
});

describe('slideAlongNormal', () => {
  it('moves nodes only along the normal and stretches neighbours', () => {
    const g = graphFromEdges([
      [[0, 0], [400, 0], 100],
      [[400, 0], [400, 300], 100],
    ]);
    const result = slideAlongNormal(g, [[0, 0], [400, 0]], {
      anchor: [200, 0],
      normal: [0, 1],
      down: [200, 0],
      pointer: [260, 100],
      scale: 1,
    });
    expect(result.ring).toBeNull();
    expect(g.hasPointNode([0, 100])).toBe(true);
    expect(g.hasPointNode([400, 100])).toBe(true);
    expect(g.hasPointNode([400, 300])).toBe(true);
    expect(g.getPointDegree([400, 100])).toBe(2);
  });

  it('snaps the grabbed point to a vertex, still only along the normal', () => {
    const g = graphFromEdges([
      [[0, 0], [400, 0], 100],
      [[230, 150], [230, 400], 100],
    ]);
    const result = slideAlongNormal(g, [[0, 0], [400, 0]], {
      anchor: [200, 0],
      normal: [0, 1],
      down: [200, 0],
      pointer: [200, 145],
      scale: 1,
    });
    // Candidate [200, 145] is 30 from [230, 150]: out of reach, so free.
    expect(result.ring).toBeNull();

    const g2 = graphFromEdges([
      [[0, 0], [400, 0], 100],
      [[205, 150], [205, 400], 100],
    ]);
    const snapped = slideAlongNormal(g2, [[0, 0], [400, 0]], {
      anchor: [200, 0],
      normal: [0, 1],
      down: [200, 0],
      pointer: [200, 145],
      scale: 1,
    });
    expect(snapped.ring).toEqual({ at: [205, 150], kind: 'snap' });
    expect(g2.hasPointNode([0, 150])).toBe(true);
    expect(g2.hasPointNode([400, 150])).toBe(true);
  });
});
