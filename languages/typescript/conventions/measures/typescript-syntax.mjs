import { createRequire } from 'node:module';

export function parsedSource(text, file) {
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return { ts, source };
}

export function descendants(ts, root) {
  const nodes = [root];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
  }
  return nodes;
}
