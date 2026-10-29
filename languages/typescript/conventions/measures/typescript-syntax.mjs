import { createRequire } from 'node:module';
import { TYPESCRIPT_API } from '../../typescript-api/api-selection.mjs';

export function parsedSource(text, file) {
  const ts = createRequire(import.meta.url)(TYPESCRIPT_API.file);
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
