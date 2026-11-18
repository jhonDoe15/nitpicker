import { readFileSync } from 'node:fs';
import { pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mts';
import { readKotlinFacts } from './report/kotlin-report.mts';
import type {
  FactsModule,
  FactsView,
  ReviewManifest,
  ReviewModule,
  ViewContext,
} from './typed/review-context-types.mts';

const filesUnder: (root: string, extensions: string[]) => string[] = sourceFilesUnder;
const insideProject: (base: string, relative: string) => string = pathInside;

type ViewInput = ViewContext & { modules?: ReviewModule[] | undefined };

const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

function javaSourceText(projectRoot: string, manifests: ReviewManifest[]): string {
  const roots = new Set(
    manifests.flatMap((manifest) => [
      ...(manifest.sourceRoots ?? []),
      ...(manifest.testSourceRoots ?? []),
    ]),
  );
  return [...roots]
    .flatMap((root) => filesUnder(insideProject(projectRoot, root), ['.java']))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function javaMentions(
  projectRoot: string,
  manifests: ReviewManifest[],
): (name: string) => boolean {
  let identifiers: Set<string> | undefined;
  return (name) => {
    identifiers ??= new Set(javaSourceText(projectRoot, manifests).match(IDENTIFIER));
    return identifiers.has(name);
  };
}

export function factsView({
  modules,
  mentionedInJava,
}: {
  modules: FactsModule[];
  mentionedInJava: (name: string) => boolean;
}): FactsView {
  const memos = new Map<string, unknown>();
  return {
    modules,
    facts: new Map(modules.map((module) => [module.reportRoot, module.facts])),
    files: modules.flatMap((module) => module.facts.files),
    mentionedInJava,
    memo(key, compute, accepts) {
      if (!memos.has(key)) {
        memos.set(key, compute());
      }
      const stored = memos.get(key);
      if (!accepts(stored)) {
        throw new TypeError(`memo ${key} holds another kind of value`);
      }
      return stored;
    },
  };
}

function createView({ projectRoot, reportRoot, manifest, modules = [] }: ViewInput): FactsView {
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

export function buildViews(): (context: ViewInput) => FactsView {
  let view: FactsView | undefined;
  return (context) => {
    view ??= createView(context);
    return view;
  };
}
