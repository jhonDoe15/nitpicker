import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FixRecipe } from '../../../../../../core/fix/typed/fix-types.mts';

export function applyProject(
  recipe: FixRecipe,
  files: Readonly<Record<string, string>>,
  build: Readonly<Record<string, string>> = {},
  changed?: readonly string[],
): Record<string, string> {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-recipe-'));
  for (const [name, text] of Object.entries({ ...build, ...files })) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const { fixes } = recipe.plan({
    files: Object.entries(files)
      .filter(([name]) => changed === undefined || changed.includes(name))
      .map(([name, text]) => ({ path: name, text })),
    read: (name) => files[name] ?? build[name],
    ...(changed === undefined ? {} : { projectRoot: root }),
  });
  const edits = fixes.flatMap((fix) => fix.edits);
  const replaced = edits
    .flatMap((edit) => (edit.type === 'replace' ? [edit] : []))
    .toSorted((left, right) => right.start - left.start);
  const deleted = new Set(edits.flatMap((edit) => (edit.type === 'delete' ? [edit.path] : [])));
  const written: [string, string][] = edits.flatMap((edit): [string, string][] =>
    edit.type === 'write' ? [[edit.path, edit.text]] : [],
  );
  const rewritten = Object.entries(files)
    .filter(([name]) => !deleted.has(name))
    .map(([name, text]): [string, string] => [
      name,
      replaced
        .filter((edit) => edit.path === name)
        .reduce(
          (result, { start, end, text: replacement }) =>
            `${result.slice(0, start)}${replacement}${result.slice(end)}`,
          text,
        ),
    ]);
  return Object.fromEntries([...rewritten, ...written]);
}
