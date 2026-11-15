import type TypeScript from 'typescript';
import { importSpecifier } from '../imports/retarget.mts';
import { withProject } from '../model/project-model.mts';
import type {
  FixContext,
  Planned,
  Project,
  ProjectFix,
  ProjectRecipe,
  ReplaceEdit,
} from '../typed/project-types.mts';
import { declined, verifyEdits } from '../typed/project-views.mts';
import { projectGraph } from '../typed/reuse-views.mts';
import type { ProjectGraph, ToolFinding } from '../typed/reuse-views.mts';
import { reachable } from './reachable.mts';
import { reuseFindingsFor } from './reuse-findings.mts';
import { declarationOf, exportKeywordEdit, importInsertion, removalEdit } from './declarations.mts';
import type { Declaration } from './declarations.mts';

const RULE = 'duplicate-definition';

type Canonical = { readonly path: string; readonly declaration: Declaration };

function canonicalOf(
  project: Project,
  copies: readonly string[],
  symbol: string,
): Canonical | undefined {
  const found = copies.flatMap((path) => {
    const declaration = declarationOf(project.sourceFile(path), symbol);
    return declaration === undefined ? [] : [{ path, declaration }];
  });
  const exported = found.filter(({ declaration }) => declaration.exported);
  return (exported.length === 0 ? found : exported).reduce<Canonical | undefined>(
    (best, each) => (best === undefined || each.path.localeCompare(best.path) < 0 ? each : best),
    undefined,
  );
}

function importLine({
  kind,
  symbol,
  specifier,
}: {
  readonly kind: string;
  readonly symbol: string;
  readonly specifier: string;
}): string {
  return kind === 'type'
    ? `import type { ${symbol} } from '${specifier}';`
    : `import { ${symbol} } from '${specifier}';`;
}

function replacementEdits({
  path,
  sourceFile,
  own,
  line,
  reexport,
}: {
  readonly path: string;
  readonly sourceFile: TypeScript.SourceFile;
  readonly own: Declaration;
  readonly line: string;
  readonly reexport: string;
}): ReplaceEdit[] {
  if (own.exported) {
    return [removalEdit(path, own.statement, `${line}\n${reexport}`)];
  }
  const removal = removalEdit(path, own.statement);
  const insertion = importInsertion(path, sourceFile, line);
  const touching = insertion.start >= removal.start && insertion.start <= removal.end;
  return touching ? [removalEdit(path, own.statement, line)] : [removal, insertion];
}

function declineReason(
  context: FixContext,
  {
    finding,
    canonical,
    graph,
  }: {
    readonly finding: ToolFinding;
    readonly canonical: Canonical;
    readonly graph: ProjectGraph;
  },
): string | undefined {
  if (reachable(graph, canonical.path, finding.path)) {
    return `${canonical.path} imports ${finding.path}, so importing it would add a cycle`;
  }
  const covered = [finding.path, canonical.path].every((name) => context.accepts(name));
  return covered ? undefined : 'a copy sits in a file --fix does not cover';
}

function exportEdits(project: Project, canonical: Canonical): ReplaceEdit[] {
  return canonical.declaration.exported
    ? []
    : [
        exportKeywordEdit(
          canonical.path,
          sourceFileOf(project, canonical.path),
          canonical.declaration.statement,
        ),
      ];
}

function sourceFileOf(project: Project, path: string): TypeScript.SourceFile {
  const sourceFile = project.sourceFile(path);
  if (sourceFile === undefined) {
    throw new TypeError(`${path} is not part of the project`);
  }
  return sourceFile;
}

function copyEdits(
  context: FixContext,
  project: Project,
  {
    finding,
    canonical,
    graph,
  }: { readonly finding: ToolFinding; readonly canonical: Canonical; readonly graph: ProjectGraph },
): Planned {
  const { path, symbol } = finding;
  const own = declarationOf(project.sourceFile(path), symbol);
  if (own === undefined) {
    return declined(`${finding.symbol} is not a plain top-level declaration`);
  }
  const reason = declineReason(context, { finding, canonical, graph });
  if (reason !== undefined) {
    return declined(reason);
  }
  const sourceFile = sourceFileOf(project, path);
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

export const duplicateDefinitionRecipe: ProjectRecipe = {
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
      const fixes: ProjectFix[] = [];
      const notes: string[] = [];
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
          notes.push(`--fix left ${finding.path}:${String(line)} ${RULE}: ${planned.declined}`);
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
