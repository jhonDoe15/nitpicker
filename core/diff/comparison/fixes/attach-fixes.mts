import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../../../shared/values/findings.mts';
import { type Fix, type Recipe, fixesOf, recipesOf } from './recipe-types.mts';
import { smallest } from '../../../../shared/lists/lists.mts';

const SINGLE_FILE_EDITS = new Set(['replace', 'write']);

type ReadResult = { readonly text?: string; readonly failure?: string };

type PlannedFile = {
  readonly text: string | undefined;
  readonly fixes: readonly Fix[];
  readonly failure?: string;
};

type Context = {
  readonly projectRoot: string;
  readonly recipes: readonly Recipe[];
  readonly plans: Map<string, PlannedFile>;
};

function readFile(projectRoot: string, name: string): ReadResult {
  try {
    const base = realpathSync(projectRoot);
    const full = path.resolve(base, name);
    if (!full.startsWith(base + path.sep)) {
      return { failure: `${name} is outside the project` };
    }
    if (!existsSync(full)) {
      return { failure: `${name} does not exist` };
    }
    return realpathSync(full) === full
      ? { text: readFileSync(full, 'utf8') }
      : { failure: `${name} goes through a symbolic link` };
  } catch (error) {
    return { failure: String(error) };
  }
}

function readText(projectRoot: string, name: string): string | undefined {
  return readFile(projectRoot, name).text;
}

function covers(recipe: Recipe, finding: Finding): boolean {
  return (
    recipe.scope === 'file' &&
    recipe.rules.some(({ tool, rule }) => tool === finding.tool && rule === finding.rule)
  );
}

function matches(fix: Fix, finding: Finding): boolean {
  return (
    fix.finding.tool === finding.tool &&
    fix.finding.rule === finding.rule &&
    fix.finding.path === finding.path &&
    fix.finding.line === finding.location?.line
  );
}

function singleFile(edits: Fix['edits'], name: string): boolean {
  return (
    edits.length > 0 &&
    edits.every((edit) => SINGLE_FILE_EDITS.has(edit.type) && edit.path === name)
  );
}

function fixData(recipe: Recipe, fix: Fix, text: string) {
  const name = fix.finding.path;
  return {
    recipe: recipe.id,
    safety: recipe.safety,
    ...(singleFile(fix.edits, name)
      ? {
          path: name,
          sha256: createHash('sha256').update(text).digest('hex'),
          textLength: text.length,
          edits: fix.edits.map((edit) => ({ ...edit })),
        }
      : {}),
  };
}

function plannedFixes(recipe: Recipe, finding: Finding, context: Context): PlannedFile {
  const key = `${recipe.id}\0${finding.path}`;
  if (!context.plans.has(key)) {
    context.plans.set(key, planned(recipe, finding, context.projectRoot));
  }
  return context.plans.get(key) ?? { text: undefined, fixes: [] };
}

function planned(recipe: Recipe, finding: Finding, projectRoot: string): PlannedFile {
  const text = readText(projectRoot, finding.path);
  if (text === undefined) {
    return { text, fixes: [] };
  }
  try {
    const files = [{ path: finding.path, text }];
    const { fixes } = recipe.plan({ files, read: (name) => readText(projectRoot, name) });
    return { text, fixes: fixesOf(fixes) };
  } catch (error) {
    return { text, fixes: [], failure: String(error) };
  }
}

function startOf(fix: Fix): number {
  const starts = fix.edits
    .map((edit) => edit.start)
    .filter((start) => typeof start === 'number' && Number.isInteger(start))
    .map(Number);
  return starts.length === 0 ? Infinity : smallest(starts);
}

function siteKey({ tool, rule, path: name, location }: Finding): string {
  return JSON.stringify([tool, rule, name, location?.line]);
}

function candidates(group: readonly Finding[], context: Context) {
  const [finding] = group;
  if (finding === undefined) {
    return [];
  }
  for (const recipe of context.recipes.filter((candidate) => covers(candidate, finding))) {
    const { text, fixes } = plannedFixes(recipe, finding, context);
    const own = fixes.filter((fix) => matches(fix, finding));
    if (own.length > 0) {
      return own.length === group.length
        ? own
            .toSorted((left, right) => startOf(left) - startOf(right))
            .map((fix) => fixData(recipe, fix, text ?? ''))
        : [];
    }
  }
  return [];
}

function assignGroup(
  group: readonly Finding[],
  context: Context,
  assigned: Map<Finding, ReturnType<typeof fixData>>,
): void {
  const ordered = group.toSorted(
    (left, right) => (left.location?.column ?? 0) - (right.location?.column ?? 0),
  );
  for (const [index, fix] of candidates(ordered, context).entries()) {
    const finding = ordered[index];
    if (finding !== undefined) {
      assigned.set(finding, fix);
    }
  }
}

function assignments(findings: readonly Finding[], context: Context) {
  const groups = Map.groupBy(
    findings.filter((finding) => finding['fix'] === undefined && finding.location !== undefined),
    siteKey,
  );
  const assigned = new Map<Finding, ReturnType<typeof fixData>>();
  for (const group of groups.values()) {
    assignGroup(group, context, assigned);
  }
  return assigned;
}

export function attachFixes(
  findings: Finding[],
  projectRoot: string | undefined,
  recipes: readonly unknown[] = [],
): Finding[] {
  if (projectRoot === undefined) {
    return findings;
  }
  const assigned = assignments(findings, {
    projectRoot,
    recipes: recipesOf(recipes),
    plans: new Map(),
  });
  return findings.map((finding) =>
    assigned.has(finding) ? { ...finding, fix: assigned.get(finding) } : finding,
  );
}
