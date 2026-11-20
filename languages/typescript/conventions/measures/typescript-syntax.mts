import { createRequire } from 'node:module';
import type TypeScript from 'typescript';
import { selectTypeScriptApi } from '../../typescript-api/api-selection.mts';

const loadTypeScript: (file: string) => typeof TypeScript = createRequire(import.meta.url);

export function parsedSource(
  text: string,
  file: string,
): { readonly ts: typeof TypeScript; readonly source: TypeScript.SourceFile } {
  const ts = loadTypeScript(selectTypeScriptApi().file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return { ts, source };
}

export function descendants(ts: typeof TypeScript, root: TypeScript.Node): TypeScript.Node[] {
  const nodes = [root];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
  }
  return nodes;
}
