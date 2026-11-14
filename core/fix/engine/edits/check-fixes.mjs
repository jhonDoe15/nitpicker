import { existsSync } from 'node:fs';
import { containedPath } from '../../common/contained-path.mjs';
import { checkRealPath } from './real-paths.mjs';

const WHOLE = 'whole';

function pathsOf(edit) {
  return edit.type === 'move' ? [edit.from, edit.to] : [edit.path];
}

export function sourceOf(edit) {
  return edit.type === 'move' ? edit.from : edit.path;
}

function fail(message) {
  throw new Error(message);
}

function checkPaths(edit, { projectRoot, accepts }) {
  for (const name of pathsOf(edit)) {
    if (typeof name !== 'string') {
      fail(`a ${edit.type} edit has no path`);
    }
    checkRealPath(projectRoot, name);
    if (!accepts(name)) {
      fail(`${name} is outside the files --fix covers`);
    }
  }
}

function checkReplace(edit, { snapshot }) {
  const { start, end } = edit;
  if (typeof edit.text !== 'string' || !snapshot.isRead(edit.path)) {
    fail(`a replace edit on ${edit.path} needs text and a file the plan read`);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
    fail(`edit range ${start}-${end} in ${edit.path} is not a range`);
  }
  if (end > snapshot.read(edit.path).length) {
    fail(`edit range ${start}-${end} is past the end of ${edit.path}`);
  }
}

function checkWrite(edit, { projectRoot, snapshot }) {
  if (typeof edit.text !== 'string') {
    fail(`a write edit on ${edit.path} has no text`);
  }
  if (!snapshot.isRead(edit.path) && existsSync(checkRealPath(projectRoot, edit.path))) {
    fail(`a write edit on ${edit.path} replaces a file the plan did not read`);
  }
}

function checkRead(edit, { snapshot }) {
  if (!snapshot.isRead(sourceOf(edit))) {
    fail(`a ${edit.type} edit on ${sourceOf(edit)} needs a file the plan read`);
  }
}

function checkMove(edit, settings) {
  checkRead(edit, settings);
  if (existsSync(checkRealPath(settings.projectRoot, edit.to))) {
    fail(`a move edit would replace ${edit.to}`);
  }
}

function checkUntrack(edit, { projectRoot, scope }) {
  if (typeof edit.path !== 'string' || edit.path === '') {
    fail('an untrack edit has no path');
  }
  containedPath(projectRoot, edit.path);
  if (scope !== 'project') {
    fail(`an untrack edit on ${edit.path} needs a recipe of project scope`);
  }
}

const EDIT_CHECKS = {
  untrack: checkUntrack,
  replace: checkReplace,
  write: checkWrite,
  move: checkMove,
  delete: checkRead,
};

function checkEdit(edit, settings) {
  const check = EDIT_CHECKS[edit?.type];
  if (check === undefined) {
    fail(`unknown edit type ${edit?.type}`);
  }
  if (edit.type !== 'untrack') {
    checkPaths(edit, settings);
    if (settings.scope === 'file' && !settings.changed.has(sourceOf(edit))) {
      fail(`${sourceOf(edit)} is not a changed file`);
    }
  }
  check(edit, settings);
}

function overlaps(left, right, strictInserts = true) {
  if (left === WHOLE || right === WHOLE) {
    return true;
  }
  if (left.start === right.start) {
    return strictInserts || left.start !== left.end || right.start !== right.end;
  }
  return left.start < right.end && right.start < left.end;
}

function claimsOf(edits) {
  const claims = new Map();
  for (const edit of edits) {
    for (const name of pathsOf(edit)) {
      const claim = edit.type === 'replace' ? { start: edit.start, end: edit.end } : WHOLE;
      claims.set(name, [...(claims.get(name) ?? []), claim]);
    }
  }
  return claims;
}

function conflicts(claims, taken) {
  return [...claims].some(([name, ranges]) =>
    ranges.some((range) => (taken.get(name) ?? []).some((other) => overlaps(range, other, false))),
  );
}

function selfOverlapping(claims) {
  return [...claims].some(([, ranges]) =>
    ranges.some((range, index) => ranges.slice(index + 1).some((other) => overlaps(range, other))),
  );
}

function checkFinding(finding, recipe) {
  const listed = recipe.rules.some(
    ({ tool, rule }) => tool === finding?.tool && rule === finding?.rule,
  );
  if (!listed || typeof finding.path !== 'string' || !Number.isInteger(finding.line)) {
    fail(`a fix names a finding outside the rules of recipe ${recipe.id}`);
  }
}

export function checkFix(fix, recipe, settings) {
  const { finding, edits } = fix ?? {};
  checkFinding(finding, recipe);
  if (!Array.isArray(edits) || edits.length === 0) {
    fail(`a fix for ${finding.path}:${finding.line} has no edits`);
  }
  const covered = {
    ...settings,
    scope: recipe.scope,
    accepts: (name) => settings.accepts(name) || recipe.accepts?.(name) === true,
  };
  for (const edit of edits) {
    checkEdit(edit, covered);
  }
  if (selfOverlapping(claimsOf(edits))) {
    fail(`the edits of the fix for ${finding.path}:${finding.line} overlap`);
  }
}

function firstOffset(fix) {
  const edit = fix.edits[0];
  return edit.type === 'replace' ? edit.start : -1;
}

export function fixOrder(left, right) {
  return (
    left.finding.path.localeCompare(right.finding.path) ||
    firstOffset(left) - firstOffset(right) ||
    left.finding.line - right.finding.line
  );
}

export function acceptFixes(planned) {
  const taken = new Map();
  const accepted = [];
  const skipped = [];
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
