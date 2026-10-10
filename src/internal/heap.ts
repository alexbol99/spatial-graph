/** Stable binary min-heap used by routing and bounding-box search. */
export class MinHeap<T> {
  private items: Array<{ value: T; priority: number; order: number }> = [];
  private sequence = 0;
  get size(): number { return this.items.length; }
  private less(a: number, b: number): boolean {
    const x = this.items[a]!, y = this.items[b]!;
    return x.priority < y.priority || (x.priority === y.priority && x.order < y.order);
  }
  push(value: T, priority: number): void {
    this.items.push({ value, priority, order: this.sequence++ });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [this.items[i], this.items[parent]] = [this.items[parent]!, this.items[i]!];
      i = parent;
    }
  }
  pop(): { value: T; priority: number } | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        let next = i;
        const left = i * 2 + 1, right = left + 1;
        if (left < this.items.length && this.less(left, next)) next = left;
        if (right < this.items.length && this.less(right, next)) next = right;
        if (next === i) break;
        [this.items[i], this.items[next]] = [this.items[next]!, this.items[i]!];
        i = next;
      }
    }
    return first;
  }
}
