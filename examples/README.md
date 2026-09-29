# Examples

Small runnable programs, one per task. They are not part of the published
package; the same recipes are in the package README and `llms.txt`.

| File | Shows |
| --- | --- |
| [`routing.ts`](routing.ts) | Shortest path by length, path length, closest node |
| [`snap-and-connect.ts`](snap-and-connect.ts) | Snap a point onto the nearest edge and connect it |
| [`planarize.ts`](planarize.ts) | Split crossing segments at every intersection |
| [`cleanup.ts`](cleanup.ts) | Remove islands, short dead ends and pass-through nodes |
| [`proximity-graph.ts`](proximity-graph.ts) | Connect points by your own rule |
| [`save-and-load.ts`](save-and-load.ts) | JSON round trip with graphology export and import |

Each file asserts its own result, so a failing example fails the build.

## Run

Needs Node.js 22.18 or later, which runs TypeScript directly. Build first: the
examples import the package by name, which resolves to `dist/`.

```sh
pnpm build
node examples/routing.ts
pnpm check:examples   # typecheck and run all of them
```

`pnpm test` also runs every example against the sources, without a build.
