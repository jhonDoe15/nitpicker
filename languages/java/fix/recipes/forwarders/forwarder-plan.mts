import type {
  RecipeEdit,
  RecipeFix,
  RecipePlan,
  RecipePlanInput,
} from '../../../../../core/fix/typed/fix-types.mts';
import { exceptedOf, GENERATED } from '../logic/tree-fix-recipe.mts';
import { unusedImport, wordCount, type Source, type SpanEdit } from '../source/java-source.mts';
import { lineOf } from '../source/java-text.mts';
import { projectSources } from '../source/project-sources.mts';
import { callerEdits, type Project } from './forwarder-callers.mts';
import {
  parseForwarder,
  type Forwarder,
  type ForwarderKind,
  type Parsed,
} from './forwarder-parse.mts';
import { resolveTarget } from './forwarder-target.mts';

export type ForwarderRecipe = {
  readonly kind: ForwarderKind;
  readonly rule: string;
};
type Claims = Map<string, SpanEdit[]>;

const NOT_MAIN_SOURCE_SET = /(?:^|\/)src\/(?!main\/)[^/]+\//u;
const TOOL = 'pmd';

function overlaps(left: SpanEdit, right: SpanEdit): boolean {
  return left.start === right.start || (left.start < right.end && right.start < left.end);
}

function merged(edits: readonly SpanEdit[]): readonly SpanEdit[] {
  const result: { start: number; end: number; text: string }[] = [];
  const ordered = edits.toSorted((left, right) => left.start - right.start || left.end - right.end);
  for (const edit of ordered) {
    const last = result.at(-1);
    if (last !== undefined && last.start === edit.start) {
      last.end = Math.max(last.end, edit.end);
      last.text += edit.text;
    } else {
      result.push({ ...edit });
    }
  }
  return result;
}

function conflicts(claims: Claims, edits: ReadonlyMap<string, readonly SpanEdit[]>): boolean {
  return [...edits].some(([name, planned]) =>
    planned.some((edit) => (claims.get(name) ?? []).some((claimed) => overlaps(claimed, edit))),
  );
}

function ownEdits(forwarder: Forwarder, own: readonly SpanEdit[], typeName: string | undefined) {
  const { source, range } = forwarder;
  const deletion: SpanEdit = { start: range.start, end: range.end, text: '' };
  const cleanup =
    own.length === 0 && typeName !== undefined
      ? unusedImport(
          source,
          typeName,
          wordCount(source.code.slice(range.start, range.end), typeName),
        )
      : undefined;
  return [...own, deletion, ...(cleanup === undefined ? [] : [cleanup])];
}

function fixOf(
  recipe: ForwarderRecipe,
  forwarder: Forwarder,
  edits: ReadonlyMap<string, readonly SpanEdit[]>,
): RecipeFix {
  const { source } = forwarder;
  const all = new Map(edits);
  all.set(
    source.path,
    ownEdits(
      forwarder,
      edits.get(source.path) ?? [],
      forwarder.kind === 'wrapper' ? forwarder.qualifier : undefined,
    ),
  );
  return {
    finding: { tool: TOOL, rule: recipe.rule, path: source.path, line: forwarder.line },
    edits: [...all].flatMap(([path, planned]): RecipeEdit[] =>
      merged(planned).map(({ start, end, text }) => ({ type: 'replace', path, start, end, text })),
    ),
  };
}

function candidatesOf(recipe: ForwarderRecipe, source: Source): Parsed[] {
  return source.methods.flatMap((method) => {
    const parsed = parseForwarder(recipe.kind, source, method);
    return parsed === undefined || method.annotations.includes('@Override') ? [] : [parsed];
  });
}

function markNotes(recipe: ForwarderRecipe, source: Source): string[] {
  if (recipe.kind !== 'shim') {
    return [];
  }
  return [...source.code.matchAll(/@Deprecated\b/gu)]
    .filter(
      ({ index }) =>
        !source.methods.some((method) => method.start <= index && index < method.nameAt),
    )
    .map(
      ({ index }) =>
        `${TOOL}/${recipe.rule} in ${source.path}:${String(lineOf(source.text, index))}: left as is, the deprecated declaration is not a static method that only forwards to its replacement`,
    );
}

type Step = {
  readonly recipe: ForwarderRecipe;
  readonly project: Project;
  readonly accepts: (name: string) => boolean;
};
type Outcome = { fix?: RecipeFix; note?: string };

function planOne(step: Step, forwarder: Forwarder): Outcome {
  const { recipe, project, accepts } = step;
  const where = `${TOOL}/${recipe.rule} in ${forwarder.source.path}:${String(forwarder.line)}: left as is,`;
  const target = resolveTarget(forwarder, project.sources);
  if ('declined' in target) {
    return { note: `${where} ${target.declined}` };
  }
  const callers = callerEdits({ forwarder, resolved: target.resolved, project, accepts });
  if ('declined' in callers) {
    return { note: `${where} ${callers.declined}` };
  }
  return { fix: fixOf(recipe, forwarder, callers.edits) };
}

function replacesOf(fix: RecipeFix | undefined): Map<string, SpanEdit[]> {
  const touched = new Map<string, SpanEdit[]>();
  for (const edit of fix?.edits ?? []) {
    if (edit.type === 'replace') {
      const list = touched.get(edit.path) ?? [];
      list.push(edit);
      touched.set(edit.path, list);
    }
  }
  return touched;
}

function scopeOf(recipe: ForwarderRecipe, { files, inputs }: RecipePlanInput): Set<string> {
  const isExcepted = exceptedOf(inputs);
  return new Set(
    files
      .map(({ path }) => path)
      .filter(
        (name) =>
          name.endsWith('.java') &&
          !NOT_MAIN_SOURCE_SET.test(name) &&
          !GENERATED.test(name) &&
          !isExcepted(`${TOOL}/${recipe.rule}`, name),
      ),
  );
}

function notesOf(recipe: ForwarderRecipe, source: Source, outcomes: readonly Outcome[]): string[] {
  const declined = candidatesOf(recipe, source).flatMap((parsed) =>
    'declined' in parsed
      ? [
          `${TOOL}/${recipe.rule} in ${source.path}:${String(parsed.line)}: left as is, ${parsed.declined}`,
        ]
      : [],
  );
  const planned = outcomes.flatMap(({ note }) => (note === undefined ? [] : [note]));
  return [...markNotes(recipe, source), ...declined, ...planned];
}

function claim(claims: Claims, touched: ReadonlyMap<string, readonly SpanEdit[]>): boolean {
  if (conflicts(claims, touched)) {
    return false;
  }
  for (const [name, planned] of touched) {
    claims.set(name, [...(claims.get(name) ?? []), ...planned]);
  }
  return true;
}

function planSource(
  step: Step,
  source: Source,
  claims: Claims,
): { fixes: RecipeFix[]; notes: string[] } {
  const outcomes: Outcome[] = [];
  const fixes: RecipeFix[] = [];
  for (const parsed of candidatesOf(step.recipe, source)) {
    if ('declined' in parsed) {
      continue;
    }
    const outcome = planOne(step, parsed.forwarder);
    outcomes.push(outcome);
    if (outcome.fix !== undefined && claim(claims, replacesOf(outcome.fix))) {
      fixes.push(outcome.fix);
    }
  }
  return { fixes, notes: notesOf(step.recipe, source, outcomes) };
}

export function planForwarders(recipe: ForwarderRecipe, input: RecipePlanInput): RecipePlan {
  const { read, projectRoot, accepts } = input;
  if (read === undefined || projectRoot === undefined || accepts === undefined) {
    return { fixes: [] };
  }
  const project = projectSources(projectRoot, read);
  const inScope = scopeOf(recipe, input);
  const claims: Claims = new Map();
  const results = project.sources
    .filter(({ path }) => inScope.has(path))
    .map((source) => planSource({ recipe, project, accepts }, source, claims));
  return {
    fixes: results.flatMap(({ fixes }) => fixes),
    notes: results.flatMap(({ notes }) => notes),
  };
}
