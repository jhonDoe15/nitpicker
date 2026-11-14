import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const SINGLE_FILE_EDITS = new Set(['replace', 'write']);

function readFile(projectRoot, name) {
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

function readText(projectRoot, name) {
  return readFile(projectRoot, name).text;
}

function covers(recipe, finding) {
  return (
    recipe.scope === 'file' &&
    recipe.rules.some(({ tool, rule }) => tool === finding.tool && rule === finding.rule)
  );
}

function matches(fix, finding) {
  return (
    fix.finding.tool === finding.tool &&
    fix.finding.rule === finding.rule &&
    fix.finding.path === finding.path &&
    fix.finding.line === finding.location?.line
  );
}

function singleFile(edits, name) {
  return (
    Array.isArray(edits) &&
    edits.length > 0 &&
    edits.every((edit) => SINGLE_FILE_EDITS.has(edit.type) && edit.path === name)
  );
}

function fixData(recipe, fix, text) {
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

function plannedFixes(recipe, finding, context) {
  const key = `${recipe.id}\0${finding.path}`;
  if (!context.plans.has(key)) {
    context.plans.set(key, planned(recipe, finding, context.projectRoot));
  }
  return context.plans.get(key);
}

function planned(recipe, finding, projectRoot) {
  const text = readText(projectRoot, finding.path);
  if (text === undefined) {
    return { text, fixes: [] };
  }
  try {
    const files = [{ path: finding.path, text }];
    const { fixes } = recipe.plan({ files, read: (name) => readText(projectRoot, name) });
    return { text, fixes: Array.isArray(fixes) ? fixes : [] };
  } catch (error) {
    return { text, fixes: [], failure: String(error) };
  }
}

function startOf(fix) {
  const starts = fix.edits.map((edit) => edit.start).filter(Number.isInteger);
  return starts.length === 0 ? Infinity : Math.min(...starts);
}

function siteKey({ tool, rule, path: name, location }) {
  return JSON.stringify([tool, rule, name, location?.line]);
}

function candidates(group, context) {
  const [finding] = group;
  for (const recipe of context.recipes.filter((candidate) => covers(candidate, finding))) {
    const { text, fixes } = plannedFixes(recipe, finding, context);
    const own = fixes.filter((fix) => matches(fix, finding));
    if (own.length > 0) {
      return own.length === group.length
        ? own
            .toSorted((left, right) => startOf(left) - startOf(right))
            .map((fix) => fixData(recipe, fix, text))
        : [];
    }
  }
  return [];
}

function assignments(findings, context) {
  const groups = Map.groupBy(
    findings.filter((finding) => finding.fix === undefined && finding.location !== undefined),
    siteKey,
  );
  const assigned = new Map();
  for (const group of groups.values()) {
    const ordered = group.toSorted(
      (left, right) => (left.location.column ?? 0) - (right.location.column ?? 0),
    );
    for (const [index, fix] of candidates(ordered, context).entries()) {
      assigned.set(ordered[index], fix);
    }
  }
  return assigned;
}

export function attachFixes(findings, projectRoot, recipes = []) {
  if (projectRoot === undefined) {
    return findings;
  }
  const assigned = assignments(findings, { projectRoot, recipes, plans: new Map() });
  return findings.map((finding) =>
    assigned.has(finding) ? { ...finding, fix: assigned.get(finding) } : finding,
  );
}
