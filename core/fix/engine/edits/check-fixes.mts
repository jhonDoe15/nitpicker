import { existsSync } from 'node:fs';
import { containedPath } from '../../tool-steps/paths/contained-path.mts';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { checkRealPath } from './real-paths.mts';
import type { Claim, RecipeEdit, LooseEdit, Snapshot } from '../../typed/edit-types.mts';

type CheckSettings = {
  readonly projectRoot: string;
  readonly snapshot: Snapshot;
  readonly accepts: (name: string) => boolean;
  readonly changed: ReadonlySet<string>;
  readonly scope?: string | undefined;
};

type RecipeShape = {
  readonly id: string;
  readonly scope: string;
  readonly rules: readonly { readonly tool: string; readonly rule: string }[];
  readonly accepts?: ((name: string) => boolean) | undefined;
};

type PlannedEntry = { readonly fix: { readonly edits: readonly LooseEdit[] } };
type OrderedFix = {
  readonly finding: { readonly path: string; readonly line: number };
  readonly edits: readonly LooseEdit[];
};

const WHOLE = 'whole';

function pathsOf(edit: LooseEdit): unknown[] {
  return edit.type === 'move' ? [edit.from, edit.to] : [edit.path];
}

export function sourceOf(edit: RecipeEdit): string {
  return edit.type === 'move' ? edit.from : edit.path;
}

function fail(message: string): never {
  throw new Error(message);
}

function checkPaths(edit: LooseEdit, { projectRoot, accepts }: CheckSettings): void {
  for (const name of pathsOf(edit)) {
    if (typeof name !== 'string') {
      fail(`a ${textOf(edit.type)} edit has no path`);
    }
    checkRealPath(projectRoot, name);
    if (!accepts(name)) {
      fail(`${name} is outside the files --fix covers`);
    }
  }
}

function checkReplace(edit: LooseEdit, { snapshot }: CheckSettings): void {
  const { start, end } = edit;
  const name = textOf(edit.path);
  if (typeof edit.text !== 'string' || !snapshot.isRead(name)) {
    fail(`a replace edit on ${name} needs text and a file the plan read`);
  }
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end
  ) {
    fail(`edit range ${textOf(start)}-${textOf(end)} in ${name} is not a range`);
  }
  if (end > (snapshot.read(name) ?? '').length) {
    fail(`edit range ${String(start)}-${String(end)} is past the end of ${name}`);
  }
}

function checkWrite(edit: LooseEdit, { projectRoot, snapshot }: CheckSettings): void {
  const name = textOf(edit.path);
  if (typeof edit.text !== 'string') {
    fail(`a write edit on ${name} has no text`);
  }
  if (!snapshot.isRead(name) && existsSync(checkRealPath(projectRoot, name))) {
    fail(`a write edit on ${name} replaces a file the plan did not read`);
  }
}

function looseSourceOf(edit: LooseEdit): string {
  return textOf(edit.type === 'move' ? edit.from : edit.path);
}

function checkRead(edit: LooseEdit, { snapshot }: CheckSettings): void {
  if (!snapshot.isRead(looseSourceOf(edit))) {
    fail(`a ${textOf(edit.type)} edit on ${looseSourceOf(edit)} needs a file the plan read`);
  }
}

function checkMove(edit: LooseEdit, settings: CheckSettings): void {
  checkRead(edit, settings);
  const target = textOf(edit.to);
  if (existsSync(checkRealPath(settings.projectRoot, target))) {
    fail(`a move edit would replace ${target}`);
  }
}

function checkUntrack(edit: LooseEdit, { projectRoot, scope }: CheckSettings): void {
  if (typeof edit.path !== 'string' || edit.path === '') {
    fail('an untrack edit has no path');
  }
  containedPath(projectRoot, edit.path);
  if (scope !== 'project') {
    fail(`an untrack edit on ${edit.path} needs a recipe of project scope`);
  }
}

const EDIT_CHECKS: Record<
  string,
  ((edit: LooseEdit, settings: CheckSettings) => void) | undefined
> = {
  untrack: checkUntrack,
  replace: checkReplace,
  write: checkWrite,
  move: checkMove,
  delete: checkRead,
};

function checkEdit(edit: LooseEdit | undefined, settings: CheckSettings): void {
  const type = edit?.type;
  const check = typeof type === 'string' ? EDIT_CHECKS[type] : undefined;
  if (check === undefined || edit === undefined) {
    fail(`unknown edit type ${textOf(type)}`);
  }
  if (edit.type !== 'untrack') {
    checkPaths(edit, settings);
    if (settings.scope === 'file' && !settings.changed.has(looseSourceOf(edit))) {
      fail(`${looseSourceOf(edit)} is not a changed file`);
    }
  }
  check(edit, settings);
}

function overlaps(left: Claim, right: Claim, strictInserts = true): boolean {
  if (left === WHOLE || right === WHOLE) {
    return true;
  }
  if (left.start === right.start) {
    return strictInserts || left.start !== left.end || right.start !== right.end;
  }
  return left.start < right.end && right.start < left.end;
}

function claimOf(edit: LooseEdit): Claim {
  return edit.type === 'replace' && typeof edit.start === 'number' && typeof edit.end === 'number'
    ? { start: edit.start, end: edit.end }
    : WHOLE;
}

function claimsOf(edits: readonly LooseEdit[]): Map<string, Claim[]> {
  const claims = new Map<string, Claim[]>();
  for (const edit of edits) {
    for (const name of pathsOf(edit)) {
      const key = textOf(name);
      claims.set(key, [...(claims.get(key) ?? []), claimOf(edit)]);
    }
  }
  return claims;
}

function conflicts(
  claims: ReadonlyMap<string, Claim[]>,
  taken: ReadonlyMap<string, Claim[]>,
): boolean {
  return [...claims].some(([name, ranges]) =>
    ranges.some((range) => (taken.get(name) ?? []).some((other) => overlaps(range, other, false))),
  );
}

function selfOverlapping(claims: ReadonlyMap<string, Claim[]>): boolean {
  return [...claims].some(([, ranges]) =>
    ranges.some((range, index) => ranges.slice(index + 1).some((other) => overlaps(range, other))),
  );
}

type CheckedFinding = { readonly path: string; readonly line: number };

function checkFinding(finding: unknown, recipe: RecipeShape): asserts finding is CheckedFinding {
  const listed = recipe.rules.some(
    ({ tool, rule }) => tool === fieldOf(finding, 'tool') && rule === fieldOf(finding, 'rule'),
  );
  const line = fieldOf(finding, 'line');
  if (
    !listed ||
    typeof fieldOf(finding, 'path') !== 'string' ||
    typeof line !== 'number' ||
    !Number.isInteger(line)
  ) {
    fail(`a fix names a finding outside the rules of recipe ${recipe.id}`);
  }
}

function isEditList(value: unknown): value is readonly LooseEdit[] {
  return Array.isArray(value);
}

export function checkFix(
  fix: unknown,
  recipe: RecipeShape,
  settings: Omit<CheckSettings, 'scope'>,
): void {
  const finding = fieldOf(fix, 'finding');
  const edits = fieldOf(fix, 'edits');
  checkFinding(finding, recipe);
  for (const other of listOf(fieldOf(fix, 'alsoFixes'))) {
    checkFinding(other, recipe);
  }
  if (!isEditList(edits) || edits.length === 0) {
    fail(`a fix for ${finding.path}:${String(finding.line)} has no edits`);
  }
  const covered: CheckSettings = {
    ...settings,
    scope: recipe.scope,
    accepts: (name: string) => settings.accepts(name) || recipe.accepts?.(name) === true,
  };
  for (const edit of edits) {
    checkEdit(edit, covered);
  }
  if (selfOverlapping(claimsOf(edits))) {
    fail(`the edits of the fix for ${finding.path}:${String(finding.line)} overlap`);
  }
}

function firstOffset(fix: OrderedFix): number {
  const edit = fix.edits[0];
  return edit?.type === 'replace' && typeof edit.start === 'number' ? edit.start : -1;
}

export function fixOrder(left: OrderedFix, right: OrderedFix): number {
  return (
    left.finding.path.localeCompare(right.finding.path) ||
    firstOffset(left) - firstOffset(right) ||
    left.finding.line - right.finding.line
  );
}

export function acceptFixes<Entry extends PlannedEntry>(
  planned: readonly Entry[],
): { accepted: Entry[]; skipped: Entry[] } {
  const taken = new Map<string, Claim[]>();
  const accepted: Entry[] = [];
  const skipped: Entry[] = [];
  for (const entry of planned) {
    const claims = claimsOf(entry.fix.edits);
    if (conflicts(claims, taken)) {
      skipped.push(entry);
      continue;
    }
    for (const [name, ranges] of claims) {
      taken.set(name, [...(taken.get(name) ?? []), ...ranges]);
    }
    accepted.push(entry);
  }
  return { accepted, skipped };
}
