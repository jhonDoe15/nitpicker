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

export function factsView({ modules, mentionedInJava }) {
  const memos = new Map();
  return {
    modules,
    facts: new Map(modules.map((module) => [module.reportRoot, module.facts])),
    files: modules.flatMap((module) => module.facts.files),
    mentionedInJava,
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
  return factsView({
    modules: listed.map((module) => ({
      reportRoot: module.reportRoot,
      path: module.path,
      manifest: module.manifest ?? {},
      facts: readKotlinFacts(module.reportRoot),
    })),
    mentionedInJava: javaMentions(
      projectRoot,
      listed.map((module) => module.manifest ?? {}),
    ),
  });
}

export function buildViews() {
  let view;
  return (context) => {
    view ??= createView(context);
    return view;
  };
}
