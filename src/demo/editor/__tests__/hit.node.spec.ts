import { describe, expect, it } from 'vitest';
import { findGhost, ghostPosition, hitTest, vertexRadius } from '../hit.js';
import { graphFromEdges } from '../sample.js';

const graph = () =>
  graphFromEdges([
    [[0, 0], [400, 0], 140],
    [[400, 0], [400, 300], 140],
  ]);

describe('hitTest', () => {
  it('prefers a vertex over everything else', () => {
    expect(hitTest(graph(), [3, 2], 1)).toEqual({ kind: 'vertex', at: [0, 0] });
  });

  it('finds the insertion ghost at an edge midpoint', () => {
    expect(hitTest(graph(), [200, 3], 1)).toMatchObject({ kind: 'ghost', at: [200, 0] });
  });

  it('can skip ghosts', () => {
    expect(hitTest(graph(), [200, 3], 1, { ghosts: false }).kind).toBe('body');
  });

  it('hits a body out to half its width', () => {
    expect(hitTest(graph(), [100, 60], 1).kind).toBe('body');
    expect(hitTest(graph(), [100, 90], 1).kind).toBe('empty');
  });

  it('keeps a thin body hittable at any zoom', () => {
    const thin = graphFromEdges([[[0, 0], [400, 0], 10]]);
    // 6 px at scale 0.1 is 60 world units
    expect(hitTest(thin, [100, 40], 0.1).kind).toBe('body');
  });
});

describe('ghosts', () => {
  it('sits at the midpoint', () => {
    expect(ghostPosition([[0, 0], [400, 0]], 1)).toEqual([200, 0]);
  });

  it('is withheld on an edge too short on screen', () => {
    expect(ghostPosition([[0, 0], [400, 0]], 0.05)).toBeNull();
  });

  it('is found only within reach', () => {
    expect(findGhost(graph(), [200, 20], 1, 28)).not.toBeNull();
    expect(findGhost(graph(), [200, 60], 1, 28)).toBeNull();
  });
});

describe('vertexRadius', () => {
  it('is screen-stable', () => {
    expect(vertexRadius(graph(), [0, 0], 1)).toBe(9);
  });

  it('never outgrows the narrowest adjacent half-width', () => {
    const narrow = graphFromEdges([[[0, 0], [400, 0], 80]]);
    // 9 px at scale 0.05 would be 180 units
    expect(vertexRadius(narrow, [0, 0], 0.05)).toBe(40);
  });
});
