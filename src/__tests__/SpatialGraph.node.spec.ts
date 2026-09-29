import { describe, it, expect } from 'vitest';
import { SpatialGraph } from '../SpatialGraph.js';
import { Segment, Point, Multiline } from '@flatten-js/core';
import type { NxPoint } from '../types.js';

describe('SpatialGraph', () => {
  describe('constructor', () => {
    it('should create an empty graph', () => {
      const graph = new SpatialGraph();
      expect(graph.order).toBe(0);
      expect(graph.size).toBe(0);
    });

    it('should create a graph with segments', () => {
      const segments = [
        new Segment(new Point(0, 0), new Point(1, 0)),
        new Segment(new Point(1, 0), new Point(1, 1)),
      ];
      const graph = new SpatialGraph({ segments });

      expect(graph.order).toBe(3); // 3 unique nodes
      expect(graph.size).toBe(2); // 2 edges
    });

    it('should apply one multiline attribute to each expanded segment', () => {
      const graph = new SpatialGraph({
        segments: [
          new Multiline([
            new Segment(new Point(0, 0), new Point(1, 0)),
            new Segment(new Point(1, 0), new Point(2, 0)),
          ]),
          new Segment(new Point(2, 0), new Point(3, 0)),
        ],
        attrs: [{ zone: 'multiline' }, { zone: 'segment' }],
      });

      expect(
        graph.getEdgeAttributesFor([
          [0, 0],
          [1, 0],
        ])?.zone,
      ).toBe('multiline');
      expect(
        graph.getEdgeAttributesFor([
          [1, 0],
          [2, 0],
        ])?.zone,
      ).toBe('multiline');
      expect(
        graph.getEdgeAttributesFor([
          [2, 0],
          [3, 0],
        ])?.zone,
      ).toBe('segment');
    });
  });

  describe('addSegment', () => {
    it('should add a segment to the graph', () => {
      const graph = new SpatialGraph();
      const segment = new Segment(new Point(0, 0), new Point(1, 0));

      graph.addSegment(segment);

      expect(graph.order).toBe(2);
      expect(graph.size).toBe(1);
    });

    it('should not add zero-length segments', () => {
      const graph = new SpatialGraph();
      const segment = new Segment(new Point(0, 0), new Point(0, 0));

      graph.addSegment(segment);

      expect(graph.order).toBe(0);
      expect(graph.size).toBe(0);
    });

    it('should not add duplicate edges', () => {
      const graph = new SpatialGraph();
      const segment = new Segment(new Point(0, 0), new Point(1, 0));

      graph.addSegment(segment);
      graph.addSegment(segment);

      expect(graph.size).toBe(1);
    });
  });

  describe('getNodes and getEdges', () => {
    it('should return all nodes in the graph', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(1, 1)));

      const nodes = graph.getNodes();
      expect(nodes.length).toBe(3);
    });

    it('should return all edges in the graph', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(1, 1)));

      const edges = graph.getEdges();
      expect(edges.length).toBe(2);
    });
  });

  describe('getJunctions and getStubs', () => {
    it('should identify junction nodes (degree > 2)', () => {
      const graph = new SpatialGraph();
      // Create a T-junction
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(2, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(1, 1)));

      const junctions = graph.getJunctions();
      expect(junctions.length).toBe(1);
      expect(junctions[0]).toEqual([1, 0]);
    });

    it('should identify stub nodes (degree = 1)', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));

      const stubs = graph.getStubs();
      expect(stubs.length).toBe(2);
    });

    it('should check if a node is a stub', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));

      expect(graph.isStub([0, 0])).toBe(true);
      expect(graph.isStub([1, 0])).toBe(true);
      expect(graph.isStub([2, 2])).toBe(false); // doesn't exist
    });
  });

  describe('findNearestEdge', () => {
    it('should find the nearest edge to a point', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));
      graph.addSegment(new Segment(new Point(0, 10), new Point(10, 10)));

      const point: NxPoint = [5, 2];
      const nearestEdge = graph.findNearestEdge(point);

      // Should be closer to the first edge (y=0) than second (y=10)
      expect(nearestEdge.start.y).toBe(0);
      expect(nearestEdge.end.y).toBe(0);
    });

    it('should throw error when graph has no edges', () => {
      const graph = new SpatialGraph();

      expect(() => graph.findNearestEdge([5, 5])).toThrow('Graph has no edges');
    });
  });

  describe('getClosestNodeToPoint', () => {
    it('should find the closest node to a point', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));
      graph.addSegment(new Segment(new Point(0, 10), new Point(10, 10)));

      const point: NxPoint = [1, 1];
      const closestNode = graph.getClosestNodeToPoint(point);

      // Closest to (0, 0)
      expect(closestNode).toEqual([0, 0]);
    });
  });

  describe('hasOrthogonalEdges', () => {
    it('should detect orthogonal edges at a node', () => {
      const graph = new SpatialGraph();
      // Create an L-shape (perpendicular edges)
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(1, 1)));

      expect(graph.hasOrthogonalEdges([1, 0])).toBe(true);
      expect(graph.hasOrthogonalEdges([0, 0])).toBe(false); // only 1 edge
    });
  });

  describe('moveNode', () => {
    it('should move a node and update connected edges', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(1, 1)));

      graph.moveNode([1, 0], [2, 0]);

      const nodes = graph.getNodes();
      expect(nodes).toContainEqual([2, 0]);
      expect(nodes).not.toContainEqual([1, 0]);
    });

    it('should throw error when moving non-existent node', () => {
      const graph = new SpatialGraph();

      expect(() => graph.moveNode([5, 5], [6, 6])).toThrow('Node does not exist');
    });

    it('should merge node attributes when moving into an existing node', () => {
      const graph = new SpatialGraph();

      graph.addVertex([0, 0], { movedOnly: true, shared: 'moved' });
      graph.addVertex([1, 0], { targetOnly: true, shared: 'target' });
      graph.addSegment(new Segment(new Point(0, 0), new Point(-1, 0)));

      graph.moveNode([0, 0], [1, 0]);

      expect(graph.hasNode('0,0')).toBe(false);
      expect(graph.getNodeAttributes('1,0')).toEqual({
        movedOnly: true,
        targetOnly: true,
        shared: 'target',
      });
    });
  });

  describe('splitEdge', () => {
    it('should split an edge at a point', () => {
      const graph = new SpatialGraph();
      const segment = new Segment(new Point(0, 0), new Point(10, 0));
      graph.addSegment(segment);

      const originalSize = graph.size;
      graph.splitEdge(
        [
          [0, 0],
          [10, 0],
        ],
        [5, 0],
      );

      expect(graph.size).toBe(originalSize + 1); // 2 edges instead of 1
      const nodes = graph.getNodes();
      expect(nodes).toContainEqual([5, 0]);
    });
  });

  describe('topology helpers', () => {
    it('should expose coordinate node and edge lookups', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));

      expect(graph.getPointKey([0, 0])).toBe('0,0');
      expect(
        graph.getEdgeKeyFor([
          [0, 0],
          [10, 0],
        ]),
      ).toBeTruthy();
      expect(
        graph.getEdgeKeyFor([
          [0, 0],
          [0, 10],
        ]),
      ).toBeNull();
      expect(graph.getEdgeBetweenPoints([10, 0], [0, 0])).toEqual([
        [10, 0],
        [0, 0],
      ]);
      expect(graph.getEdgeBetweenPoints([0, 0], [0, 10])).toBeNull();
    });

    it('should split an edge', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)), {
        width: 120,
        label: 'corridor',
      });

      graph.splitEdge(
        [
          [0, 0],
          [10, 0],
        ],
        [5, 0],
      );

      expect(graph.getNodes()).toContainEqual([5, 0]);
      expect(graph.getEdgeBetweenPoints([0, 0], [5, 0])).toEqual([
        [0, 0],
        [5, 0],
      ]);
      expect(graph.getEdgeBetweenPoints([5, 0], [10, 0])).toEqual([
        [5, 0],
        [10, 0],
      ]);
      expect(graph.getEdgeBetweenPoints([0, 0], [10, 0])).toBeNull();
      expect(
        graph.getEdgeAttributesFor([
          [0, 0],
          [5, 0],
        ]),
      ).toMatchObject({
        width: 120,
        label: 'corridor',
        weight: 5,
      });
      expect(
        graph.getEdgeAttributesFor([
          [5, 0],
          [10, 0],
        ]),
      ).toMatchObject({
        width: 120,
        label: 'corridor',
        weight: 5,
      });
    });

    it('should assign distinct ids to split edges when the original edge has an id', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)), {
        id: '0,0|10,0',
        label: 'corridor',
        width: 120,
      });

      graph.splitEdge(
        [
          [0, 0],
          [10, 0],
        ],
        [5, 0],
      );

      expect(
        graph.getEdgeAttributesFor([
          [0, 0],
          [5, 0],
        ]),
      ).toMatchObject({
        id: '0,0|5,0',
        label: 'corridor',
        width: 120,
      });
      expect(
        graph.getEdgeAttributesFor([
          [5, 0],
          [10, 0],
        ]),
      ).toMatchObject({
        id: '10,0|5,0',
        label: 'corridor',
        width: 120,
      });
    });

    it('should not split missing edges or split at endpoints', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));

      graph.splitEdge(
        [
          [0, 0],
          [0, 10],
        ],
        [0, 5],
      );
      graph.splitEdge(
        [
          [0, 0],
          [10, 0],
        ],
        [0, 0],
      );

      expect(graph.size).toBe(1);
    });

    it('should collapse a point into another point and rewire incident edges', () => {
      const graph = new SpatialGraph();
      graph.addVertex([0, 0], { sourceOnly: true, shared: 'source' });
      graph.addVertex([10, 0], { targetOnly: true, shared: 'target' });
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)), { label: 'collapsed' });
      graph.addSegment(new Segment(new Point(0, 0), new Point(-10, 0)), {
        label: 'rewired',
        width: 90,
      });

      graph.collapsePointInto([0, 0], [10, 0]);

      expect(graph.hasPointNode([0, 0])).toBe(false);
      expect(graph.hasPointNode([10, 0])).toBe(true);
      expect(graph.getPointAttributes([10, 0])).toEqual({
        sourceOnly: true,
        targetOnly: true,
        shared: 'target',
      });
      expect(graph.getEdgeBetweenPoints([0, 0], [10, 0])).toBeNull();
      expect(
        graph.getEdgeAttributesFor([
          [10, 0],
          [-10, 0],
        ]),
      ).toMatchObject({
        label: 'rewired',
        width: 90,
        weight: 20,
      });
    });

    it('should preserve existing edge attributes when collapse would create a duplicate edge', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(0, 10)), {
        label: 'moved',
        width: 80,
      });
      graph.addSegment(new Segment(new Point(10, 0), new Point(0, 10)), {
        label: 'existing',
        clearanceWidth: 140,
      });

      graph.collapsePointInto([0, 0], [10, 0]);

      expect(
        graph.getEdgeAttributesFor([
          [10, 0],
          [0, 10],
        ]),
      ).toMatchObject({
        label: 'existing',
        width: 80,
        clearanceWidth: 140,
      });
      expect(graph.size).toBe(1);
    });

    it('should remove a stub point and its incident edge', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));

      graph.removeStubPoint([0, 0]);

      expect(graph.hasPointNode([0, 0])).toBe(false);
      expect(graph.hasPointNode([10, 0])).toBe(true);
      expect(graph.size).toBe(0);
    });

    it('should not remove a non-stub point with removeStubPoint', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));
      graph.addSegment(new Segment(new Point(10, 0), new Point(20, 0)));

      graph.removeStubPoint([10, 0]);

      expect(graph.size).toBe(2);
      expect(graph.hasPointNode([10, 0])).toBe(true);
    });

    it('should remove a degree-2 point and join its neighbors', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)), { width: 100 });
      graph.addSegment(new Segment(new Point(10, 0), new Point(10, 10)), { width: 140 });

      graph.removeDegree2PointAndJoin([10, 0], { width: 160, label: 'joined' });

      expect(graph.hasPointNode([10, 0])).toBe(false);
      expect(graph.getEdgeBetweenPoints([0, 0], [10, 10])).toEqual([
        [0, 0],
        [10, 10],
      ]);
      expect(
        graph.getEdgeAttributesFor([
          [0, 0],
          [10, 10],
        ]),
      ).toMatchObject({
        width: 160,
        label: 'joined',
      });
    });

    it('should remove a degree-2 point without creating a duplicate joined edge', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));
      graph.addSegment(new Segment(new Point(10, 0), new Point(10, 10)));
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 10)), { label: 'existing' });

      graph.removeDegree2PointAndJoin([10, 0], { label: 'joined' });

      expect(graph.hasPointNode([10, 0])).toBe(false);
      expect(
        graph.getEdgeAttributesFor([
          [0, 0],
          [10, 10],
        ]),
      ).toMatchObject({
        label: 'existing',
      });
      expect(graph.size).toBe(1);
    });

    it('should not join nodes when the point is not degree 2', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(10, 0)));

      graph.removeDegree2PointAndJoin([0, 0]);

      expect(graph.size).toBe(1);
      expect(graph.hasPointNode([0, 0])).toBe(true);
    });
  });

  describe('getShortestPath', () => {
    it('should find shortest path between two nodes', () => {
      const graph = new SpatialGraph();
      // Create a simple path
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(1, 0), new Point(2, 0)));

      const path = graph.getShortestPath([0, 0], [2, 0]);

      expect(path.length).toBe(2);
    });

    it('should return empty array for disconnected nodes', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));
      graph.addSegment(new Segment(new Point(5, 5), new Point(6, 6)));

      const path = graph.getShortestPath([0, 0], [5, 5]);

      expect(path.length).toBe(0);
    });
  });

  describe('getSubgraph', () => {
    it('should return edges matching the requested attribute value', () => {
      const graph = new SpatialGraph();
      graph.addSegment(new Segment(new Point(0, 0), new Point(1, 0)), { zone: 'primary' });
      graph.addSegment(new Segment(new Point(1, 0), new Point(2, 0)), { zone: 'secondary' });

      const subgraph = graph.getSubgraph('zone', 'primary');

      expect(subgraph.size).toBe(1);
      expect(subgraph.getEdges()).toEqual([
        [
          [0, 0],
          [1, 0],
        ],
      ]);
    });
  });

  describe('getFilteredNodes', () => {
    it('should return nodes accepted by the predicate', () => {
      const graph = new SpatialGraph();
      graph.addVertex([0, 0], { kind: 'anchor' });
      graph.addVertex([1, 0], { kind: 'regular' });

      const filteredNodes = graph.getFilteredNodes((point, attrs) => {
        return point[0] === 0 && attrs.kind === 'anchor';
      });

      expect(filteredNodes).toEqual([[0, 0]]);
    });
  });

  describe('createCompleteGraph', () => {
    it('should create a complete graph with valid edges', () => {
      const nodes: NxPoint[] = [
        [0, 0],
        [1, 0],
        [0, 1],
      ];
      const isValid = () => true; // Accept all edges

      const graph = SpatialGraph.createCompleteGraph(nodes, isValid);

      expect(graph.order).toBe(3);
      expect(graph.size).toBe(3); // Complete graph of 3 nodes has 3 edges
    });

    it('should respect validation callback', () => {
      const nodes: NxPoint[] = [
        [0, 0],
        [1, 0],
        [0, 1],
      ];
      const isValid = () => false; // Reject all edges

      const graph = SpatialGraph.createCompleteGraph(nodes, isValid);

      expect(graph.order).toBe(3);
      expect(graph.size).toBe(0); // No edges added
    });
  });

  describe('union', () => {
    it('should merge two graphs', () => {
      const graph1 = new SpatialGraph();
      graph1.addSegment(new Segment(new Point(0, 0), new Point(1, 0)));

      const graph2 = new SpatialGraph();
      graph2.addSegment(new Segment(new Point(1, 0), new Point(2, 0)));

      graph1.union(graph2);

      expect(graph1.size).toBe(2);
    });
  });
});
