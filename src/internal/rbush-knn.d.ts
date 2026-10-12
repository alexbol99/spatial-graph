// rbush-knn 4 ships no declarations; this dependency interface stays internal.
declare module 'rbush-knn' {
  import type RBush from 'rbush';
  import type { BBox } from 'rbush';

  export default function knn<T extends BBox>(
    tree: RBush<T>,
    x: number,
    y: number,
    count?: number,
    predicate?: (item: T) => boolean,
    maxDistance?: number,
  ): T[];
}
