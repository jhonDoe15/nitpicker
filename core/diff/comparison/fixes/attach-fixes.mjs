import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { KNOWN_RECIPES } from './known-recipes.mjs';

const SINGLE_FILE_EDITS = new Set(['replace', 'write']);

function readText(projectRoot, name) {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
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

function planned(recipe, finding, projectRoot) {
  const text = readText(projectRoot, finding.path);
  if (text === undefined) {
    return { kind: 'unreadable' };
  }
  try {
    const files = [{ path: finding.path, text }];
    const { fixes } = recipe.plan({ files, read: (name) => readText(projectRoot, name) });
    const fix = fixes.find((candidate) => matches(candidate, finding));
    return fix === undefined ? { kind: 'none' } : { kind: 'fix', fix: fixData(recipe, fix, text) };
  } catch (error) {
    return { kind: 'failed', recipe: recipe.id, message: String(error) };
  }
}

function withFix(finding, { projectRoot, recipes }) {
  if (finding.fix !== undefined || finding.location === undefined) {
    return finding;
  }
  for (const recipe of recipes.filter((candidate) => covers(candidate, finding))) {
    const outcome = planned(recipe, finding, projectRoot);
    if (outcome.kind === 'fix') {
      return { ...finding, fix: outcome.fix };
    }
  }
  return finding;
}

export function attachFixes(findings, projectRoot, recipes = KNOWN_RECIPES) {
  return projectRoot === undefined
    ? findings
    : findings.map((finding) => withFix(finding, { projectRoot, recipes }));
}
