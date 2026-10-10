import RBush from 'rbush';
import type { BBox } from 'rbush';
import type { Point2D, Segment2D } from '../types.js';
import { MinHeap } from './heap.js';

export interface IndexItem extends BBox { key: string; order: number }
interface Branch extends BBox { leaf: boolean; children: Array<Branch | IndexItem> }
export function bounds([a, b]: Segment2D): BBox {
  return { minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]) };
}
export function boxDistance(point: Point2D, box: BBox): number {
  return Math.hypot(Math.max(box.minX - point[0], 0, point[0] - box.maxX), Math.max(box.minY - point[1], 0, point[1] - box.maxY));
}
/** Private mutable candidate index. Exact geometry is evaluated outside RBush. */
export class SpatialIndex {
  private tree = new RBush<IndexItem>();
  private items = new Map<string, IndexItem>();
  private sequence = 0;
  set(key: string, box: BBox): void {
    const old = this.items.get(key);
    if (old) this.tree.remove(old);
    const item = { ...box, key, order: old?.order ?? this.sequence++ };
    this.items.set(key, item);
    this.tree.insert(item);
  }
  remove(key: string): void {
    const item = this.items.get(key);
    if (item) this.tree.remove(item);
    this.items.delete(key);
  }
  clear(): void { this.tree.clear(); this.items.clear(); this.sequence = 0; }
  search(box: BBox): string[] { return this.tree.search(box).sort((a, b) => a.order - b.order).map((item) => item.key); }
  nearest(point: Point2D, evaluate: (key: string) => number): string | null {
    const heap = new MinHeap<Branch | IndexItem>();
    const root = this.tree.toJSON() as Branch;
    if (!this.items.size) return null;
    heap.push(root, boxDistance(point, root));
    let best = Infinity, winner: IndexItem | undefined;
    while (heap.size) {
      const entry = heap.pop()!;
      if (entry.priority > best) break;
      if ('key' in entry.value) {
        const candidate = entry.value;
        const d = evaluate(candidate.key);
        if (!winner || d < best || (d === best && candidate.order < winner.order)) {
          best = d; winner = candidate;
        }
      } else {
        for (const child of entry.value.children) {
          const lowerBound = boxDistance(point, child);
          if (lowerBound <= best) heap.push(child, lowerBound);
        }
      }
    }
    return winner?.key ?? null;
  }
}
