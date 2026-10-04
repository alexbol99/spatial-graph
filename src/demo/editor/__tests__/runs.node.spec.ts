import { describe, expect, it } from 'vitest';
import { detectRuns } from '../runs.js';
import { graphFromEdges } from '../sample.js';

describe('detectRuns', () => {
  it('joins collinear same-width edges into one run, ordered end to end', () => {
    const graph = graphFromEdges([
      [[0, 0], [100, 0], 120],
      [[200, 0], [100, 0], 120],
      [[200, 0], [300, 0], 120],
    ]);
    const runs = detectRuns(graph);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.edges).toHaveLength(3);
    expect(runs[0]!.nodes).toHaveLength(4);
    const [a, b] = runs[0]!.axis;
    expect([a[0], b[0]].sort((x, y) => x - y)).toEqual([0, 300]);
  });

  it('splits at a bend', () => {
    const graph = graphFromEdges([
      [[0, 0], [100, 0], 120],
      [[100, 0], [100, 100], 120],
    ]);
    expect(detectRuns(graph)).toHaveLength(2);
  });

  it('splits where the width changes', () => {
    const graph = graphFromEdges([
      [[0, 0], [100, 0], 120],
      [[100, 0], [200, 0], 160],
    ]);
    expect(detectRuns(graph)).toHaveLength(2);
  });

  it('passes straight through a T and leaves the stem as its own run', () => {
    const graph = graphFromEdges([
      [[0, 0], [200, 0], 120],
      [[200, 0], [400, 0], 120],
      [[200, 0], [200, 200], 120],
    ]);
    const runs = detectRuns(graph).sort((a, b) => b.edges.length - a.edges.length);
    expect(runs.map((run) => run.edges.length)).toEqual([2, 1]);
  });

  it('pairs both straight lines through a +', () => {
    const graph = graphFromEdges([
      [[0, 0], [200, 0], 120],
      [[200, 0], [400, 0], 120],
      [[200, -200], [200, 0], 120],
      [[200, 0], [200, 200], 120],
    ]);
    expect(detectRuns(graph).map((run) => run.edges.length)).toEqual([2, 2]);
  });

  it('does not attach two near-parallel arms to the same opposite edge', () => {
    const graph = graphFromEdges([
      [[0, 0], [-200, 0], 120],
      [[0, 0], [200, 0], 120],
      [[0, 0], [200, 5], 120],
    ]);
    const sizes = detectRuns(graph).map((run) => run.edges.length).sort();
    expect(sizes).toEqual([1, 2]);
  });
});
