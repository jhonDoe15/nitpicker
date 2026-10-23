import { readFileSync } from 'node:fs';
import { pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mjs';
import { readKotlinFacts } from './kotlin-facts.mjs';

const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

function javaSourceText(projectRoot, manifests) {
  const roots = new Set(
    manifests.flatMap((manifest) => [
      ...(manifest.sourceRoots ?? []),
      ...(manifest.testSourceRoots ?? []),
    ]),
  );
  return [...roots]
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), ['.java']))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function javaMentions(projectRoot, manifests) {
  let identifiers;
  return (name) => {
    identifiers ??= new Set(javaSourceText(projectRoot, manifests).match(IDENTIFIER));
    return identifiers.has(name);
  };
}

function callerGaps(manifests, facts) {
  const skipped = [...facts.values()].flatMap((entry) => entry.skipped ?? []);
  return [
    ...new Set([
      ...manifests.flatMap((manifest) => manifest.kotlinCallerGaps ?? []),
      ...skipped.map((file) => `the skipped file ${file}`),
    ]),
  ].sort();
}

export function factsView({ facts, manifests, mentionedInJava }) {
  const memos = new Map();
  return {
    facts,
    files: [...facts.values()].flatMap((entry) => entry.files),
    gaps: callerGaps(manifests, facts),
    mentionedInJava,
    notes: new Set(),
    memo(key, compute) {
      if (!memos.has(key)) {
        memos.set(key, compute());
      }
      return memos.get(key);
    },
  };
}

function createView({ projectRoot, reportRoot, manifest, modules = [] }) {
  const listed = modules.some((module) => module.reportRoot === reportRoot)
    ? modules
    : [{ reportRoot, manifest }, ...modules];
  const manifests = listed.map((module) => module.manifest ?? {});
  return factsView({
    facts: new Map(listed.map((module) => [module.reportRoot, readKotlinFacts(module.reportRoot)])),
    manifests,
    mentionedInJava: javaMentions(projectRoot, manifests),
  });
}

export function buildViews() {
  let view;
  return (context) => {
    view ??= createView(context);
    return view;
  };
}
