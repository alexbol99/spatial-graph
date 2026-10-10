import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const examples = readdirSync(new URL('examples/', root))
  .filter((name) => name.endsWith('.ts'))
  .sort();

// Enumerate rather than hand-maintain a list: new examples automatically run
// against source as well as dist (pnpm check:examples).
it.each(examples)('runs the asserting example %s against source', async (name) => {
  const stem = name.slice(0, -3);
  await import(`../../examples/${stem}.ts`);
});

const normalize = (code: string): string =>
  code
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

it('lists every executable example in the agent reading guide', () => {
  const guide = readFileSync(new URL('examples/README.md', root), 'utf8');
  for (const example of examples) {
    expect(guide, `Missing task entry for ${example}`).toContain(`](${example})`);
  }
});

it.each(['README.md', 'llms.txt'])('keeps %s snippets aligned with executable examples', (name) => {
  const document = readFileSync(new URL(name, root), 'utf8');
  const snippets = [...document.matchAll(/<!-- example: ([\w-]+\.ts) -->\s*```ts\n([\s\S]*?)```/g)];
  const fences = [...document.matchAll(/^```ts\s*$/gm)];
  expect(snippets.length).toBeGreaterThan(0);
  expect(snippets).toHaveLength(fences.length); // Every TS snippet needs a source of truth.

  for (const [, example, code] of snippets) {
    expect(examples, `Unknown example in ${name}`).toContain(example);
    const source = readFileSync(new URL(`examples/${example}`, root), 'utf8');
    expect(normalize(source), `${name} snippet drifted from ${example}`).toContain(
      normalize(code!),
    );
    expect(code, `${name} snippet must import the public API itself`).toContain(
      "from '@flatten-js/spatial-graph'",
    );
  }
});
