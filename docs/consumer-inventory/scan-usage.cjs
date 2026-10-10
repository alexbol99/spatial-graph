#!/usr/bin/env node
// Lists every property access in a consuming project that the TypeScript type
// checker resolves to a declaration in @flatten-js/spatial-graph, graphology or
// graphology-types: the real use surface, including inherited Graphology calls.
//
//   node scan-usage.cjs <consumer-root> <tsconfig> [out.json]
//
// Uses the consumer's own `typescript`, reads nothing else, and writes only the
// optional JSON file. Run it once per tsconfig (application code, then tests).
// Template-only .vue code is not type-checked here; grep it for the member names.
const path = require('node:path');
const fs = require('node:fs');

const [root, tsconfig, outFile] = process.argv.slice(2);
if (!root || !tsconfig) {
  console.error('usage: node scan-usage.cjs <consumer-root> <tsconfig> [out.json]');
  process.exit(2);
}

const ts = require(path.join(path.resolve(root), 'node_modules/typescript'));
const config = ts.getParsedCommandLineOfConfigFile(
  path.resolve(root, tsconfig),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => console.error(d.messageText) },
);
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();

const PACKAGES = new Set(['@flatten-js/spatial-graph', 'graphology', 'graphology-types']);
const packageOf = (fileName) => {
  const match = fileName.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  return match ? match[1] : null;
};

const records = [];
for (const source of program.getSourceFiles()) {
  if (source.fileName.includes('node_modules')) continue;
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const nameNode = ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression;
      const symbol = checker.getSymbolAtLocation(nameNode);
      const declaration = (symbol?.declarations ?? []).find((d) =>
        PACKAGES.has(packageOf(d.getSourceFile().fileName)),
      );
      if (declaration) {
        records.push({
          package: packageOf(declaration.getSourceFile().fileName),
          owner: declaration.parent?.name?.text ?? '?',
          member: nameNode.getText(),
          file: path.relative(path.resolve(root), source.fileName),
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const counts = new Map();
for (const r of records) {
  const key = `${r.package} :: ${r.owner}.${r.member}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
for (const [key, n] of [...counts].sort()) console.log(String(n).padStart(4), key);
console.error(`${records.length} accesses in ${config.fileNames.length} files`);
if (outFile) fs.writeFileSync(outFile, JSON.stringify(records, null, 1));
