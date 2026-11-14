import { declined } from '../edits/text-edits.mjs';
import { verifyEdits } from '../edits/verify-edits.mjs';
import { importSpecifier } from '../imports/retarget.mjs';
import { projectGraph } from '../model/project-graph.mjs';
import { withProject } from '../model/project-model.mjs';
import { reachable } from './reachable.mjs';
import { reuseFindingsFor } from './reuse-findings.mjs';
import { declarationOf, exportKeywordEdit, importInsertion, removalEdit } from './declarations.mjs';

const RULE = 'duplicate-definition';

function canonicalOf(project, copies, symbol) {
  const found = copies
    .map((path) => ({ path, declaration: declarationOf(project.sourceFile(path), symbol) }))
    .filter(({ declaration }) => declaration !== undefined);
  const exported = found.filter(({ declaration }) => declaration.exported);
  return (exported.length === 0 ? found : exported).reduce((best, each) =>
    each.path.localeCompare(best.path) < 0 ? each : best,
  );
}

function importLine({ kind, symbol, specifier }) {
  return kind === 'type'
    ? `import type { ${symbol} } from '${specifier}';`
    : `import { ${symbol} } from '${specifier}';`;
}

function replacementEdits({ path, sourceFile, own, line, reexport }) {
  if (own.exported) {
    return [removalEdit(path, own.statement, `${line}\n${reexport}`)];
  }
  const removal = removalEdit(path, own.statement);
  const insertion = importInsertion(path, sourceFile, line);
  const touching = insertion.start >= removal.start && insertion.start <= removal.end;
  return touching ? [removalEdit(path, own.statement, line)] : [removal, insertion];
}

function declineReason(context, { finding, own, canonical, graph }) {
  if (own === undefined) {
    return `${finding.symbol} is not a plain top-level declaration`;
  }
  if (reachable(graph, canonical.path, finding.path)) {
    return `${canonical.path} imports ${finding.path}, so importing it would add a cycle`;
  }
  const covered = [finding.path, canonical.path].every((name) => context.accepts(name));
  return covered ? undefined : 'a copy sits in a file --fix does not cover';
}

function exportEdits(project, canonical) {
  return canonical.declaration.exported
    ? []
    : [
        exportKeywordEdit(
          canonical.path,
          project.sourceFile(canonical.path),
          canonical.declaration.statement,
        ),
      ];
}

function copyEdits(context, project, { finding, canonical, graph }) {
  const { path, symbol } = finding;
  const own = declarationOf(project.sourceFile(path), symbol);
  const reason = declineReason(context, { finding, own, canonical, graph });
  if (reason !== undefined) {
    return declined(reason);
  }
  const sourceFile = project.sourceFile(path);
  const specifier = importSpecifier(project, path, canonical.path);
  const line = importLine({ kind: own.kind, symbol, specifier });
  const reexport = own.kind === 'type' ? `export type { ${symbol} };` : `export { ${symbol} };`;
  const edits = [
    ...replacementEdits({ path, sourceFile, own, line, reexport }),
    ...exportEdits(project, canonical),
  ];
  const unsafe = verifyEdits(context, project, edits);
  return unsafe === undefined ? { edits } : declined(unsafe);
}

export const duplicateDefinitionRecipe = {
  id: 'typescript-duplicate-definition',
  rules: [{ tool: 'structure', rule: RULE }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    const changed = new Set(context.files.map(({ path }) => path));
    const found = reuseFindingsFor(context, RULE);
    return withProject(context, (project) => {
      const graph = projectGraph(project);
      const fixes = [];
      const notes = [];
      for (const finding of found.filter(({ path }) => changed.has(path))) {
        const copies = found
          .filter(({ identity }) => identity === finding.identity)
          .map(({ path }) => path);
        const canonical = canonicalOf(project, copies, finding.symbol);
        if (canonical === undefined || canonical.path === finding.path) {
          continue;
        }
        const planned = copyEdits(context, project, { finding, canonical, graph });
        const line = finding.location?.line ?? 1;
        if (planned.edits === undefined) {
          notes.push(`--fix left ${finding.path}:${line} ${RULE}: ${planned.declined}`);
        } else {
          fixes.push({
            finding: { tool: finding.tool, rule: RULE, path: finding.path, line },
            edits: planned.edits,
          });
        }
      }
      return { fixes, notes };
    });
  },
};
