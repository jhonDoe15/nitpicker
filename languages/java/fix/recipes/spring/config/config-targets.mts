import {
  ENTRY_RULES as untypedEntryRules,
  flaggedEntries as untypedFlaggedEntries,
  openInViewSites as untypedOpenInViewSites,
} from '../../../../adapters/spring/java-spring.mts';
import {
  readSpringDocuments as untypedReadSpringDocuments,
  usesJpa as untypedUsesJpa,
} from '../../../../adapters/spring/spring-config-files.mts';
import {
  readTestProfiles as untypedReadTestProfiles,
  withProfileKinds as untypedWithProfileKinds,
} from '../../../../adapters/spring/spring-profiles.mts';
import { callUntyped } from '../../../../adapters/typed/java-values.mts';
import { fieldOf, listOf } from '../../../../../../shared/values/readers.mts';
import type { RecipeSource } from '../../../../../../core/fix/typed/fix-types.mts';
import type { ConfigTarget, SpringDocument, SpringEntry } from './config-types.mts';

type EntryRule = { readonly rule: string };
type Flagged = { readonly document: SpringDocument; readonly entry: SpringEntry };

const ENTRY_RULES: readonly EntryRule[] = untypedEntryRules;

function isFlagged(value: unknown): value is Flagged {
  return fieldOf(value, 'document') !== undefined && fieldOf(value, 'entry') !== undefined;
}

function flaggedEntries(documents: readonly SpringDocument[], spec: EntryRule): Flagged[] {
  return listOf(callUntyped(untypedFlaggedEntries, documents, spec)).filter(isFlagged);
}

function isSpringDocument(value: unknown): value is SpringDocument {
  return typeof fieldOf(value, 'path') === 'string' && Array.isArray(fieldOf(value, 'entries'));
}

function openInViewSites(documents: readonly SpringDocument[]): {
  readonly enabled: readonly Flagged[];
  readonly missingIn: SpringDocument | undefined;
} {
  const sites = callUntyped(untypedOpenInViewSites, documents);
  const missingIn = fieldOf(sites, 'missingIn');
  return {
    enabled: listOf(fieldOf(sites, 'enabled')).filter(isFlagged),
    missingIn: isSpringDocument(missingIn) ? missingIn : undefined,
  };
}
const readSpringDocuments: (
  projectRoot: string,
  resourceRoots: readonly string[],
) => readonly SpringDocument[] = untypedReadSpringDocuments;
const usesJpa: (projectRoot: string, sourceRoots: readonly string[]) => boolean = untypedUsesJpa;
const readTestProfiles: (projectRoot: string, testSourceRoots: readonly string[]) => unknown =
  untypedReadTestProfiles;
function withProfileKinds(
  documents: readonly SpringDocument[],
  detected: unknown,
): readonly SpringDocument[] {
  return listOf(callUntyped(untypedWithProfileKinds, documents, detected)).filter(isSpringDocument);
}

export const SPRING_CONFIG_FILE =
  /(?:^|\/)src\/main\/resources\/(?:config\/)?application(?:-[^/]+)?\.(?:properties|ya?ml)$/u;
const RESOURCES = 'src/main/resources';

function moduleOf(file: string): string {
  return file.slice(0, file.indexOf(RESOURCES));
}

function moduleTargets(projectRoot: string, prefix: string): ConfigTarget[] {
  const documents = withProfileKinds(
    readSpringDocuments(projectRoot, [`${prefix}${RESOURCES}`]),
    readTestProfiles(projectRoot, [`${prefix}src/test/java`, `${prefix}src/test/kotlin`]),
  );
  const sourceRoots = [`${prefix}src/main/java`, `${prefix}src/main/kotlin`];
  const view = usesJpa(projectRoot, sourceRoots)
    ? openInViewSites(documents)
    : { enabled: [], missingIn: undefined };
  return [
    ...ENTRY_RULES.flatMap((spec) =>
      flaggedEntries(documents, spec).map((target) => ({ ...target, rule: spec.rule })),
    ),
    ...view.enabled.map((target) => ({ ...target, rule: 'open-in-view' })),
    ...(view.missingIn === undefined
      ? []
      : [{ document: view.missingIn, entry: undefined, rule: 'open-in-view' }]),
  ].map((target) => ({ ...target, path: target.document.path, documents }));
}

export function springConfigTargets({
  projectRoot,
  files,
}: {
  readonly projectRoot: string;
  readonly files: readonly RecipeSource[];
}): ConfigTarget[] {
  const changed = new Set(
    files.map(({ path: name }) => name).filter((name) => SPRING_CONFIG_FILE.test(name)),
  );
  const prefixes = [...new Set([...changed].map(moduleOf))];
  return prefixes
    .flatMap((prefix) => moduleTargets(projectRoot, prefix))
    .filter(({ path: name }) => changed.has(name));
}
