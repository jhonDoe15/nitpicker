import { readFileSync } from 'node:fs';
import { appendAll } from '../../../../../shared/lists/lists.mts';
import { pathInside as untypedPathInside } from '../../review-rules/java-sources.mts';
import { definitionKey } from '../jvm-definition-keys.mts';
import { importFacts } from '../jvm-reference-uses.mts';
import { emptyProjectIndex, fileBindings, indexEntry, referenceScope } from '../jvm-references.mts';
import { readJvmDefinitions } from './jvm-definitions.mts';
import type {
  BoundEntry,
  Definition,
  Entry,
  Parsed,
  ProjectIndex,
  Reexport,
  ReuseFacts,
  ReuseProject,
} from '../jvm-reuse-types.mts';
import { aliasEntryFields, typeAliasReexports } from '../kotlin-type-aliases.mts';

type SourceCollector = {
  readonly modules: ReuseFacts['modules'];
  readonly definitions: ReuseFacts['definitions'];
  readonly imports: unknown[];
  readonly aliases: Reexport[];
};

const pathInside: (root: string, file: string) => string = untypedPathInside;

export function parseJvmSource(text: string, file: string): Parsed {
  return readJvmDefinitions(text, { kotlin: file.endsWith('.kt') });
}

function readEntry(projectRoot: string, file: string, project: ReuseProject): Entry {
  return {
    file,
    module: project.qualifier ?? '',
    parsed: parseJvmSource(readFileSync(pathInside(projectRoot, file), 'utf8'), file),
  };
}

function buildIndex(projectRoot: string, owners: ReadonlyMap<string, ReuseProject>): ProjectIndex {
  const index = emptyProjectIndex();
  for (const [file, project] of owners) {
    indexEntry(index, readEntry(projectRoot, file, project));
  }
  return index;
}

function neutralDefinition(
  file: string,
  definition: Definition,
  context: BoundEntry,
): { file: string; key: string; [field: string]: unknown } {
  const { start, end, owner, supertypes, ...rest } = definition;
  return { file, ...rest, key: definitionKey(definition, context) };
}

function moduleFact(
  entry: BoundEntry,
  aliases: readonly Reexport[],
): ReuseFacts['modules'][number] {
  return {
    file: entry.file,
    role: 'production',
    ...(entry.parsed.definitions.some(({ entry: isEntry }) => isEntry === true)
      ? { entry: true }
      : {}),
    ...aliasEntryFields(entry, aliases),
  };
}

function collectFileFacts(index: ProjectIndex, raw: Entry, out: SourceCollector): void {
  const entry: BoundEntry = {
    ...raw,
    bindings: fileBindings(index, raw),
    scope: referenceScope(index, raw),
  };
  const entryAliases = typeAliasReexports(index, entry);
  out.modules.push(moduleFact(entry, entryAliases));
  appendAll(
    out.definitions,
    entry.parsed.definitions.map((definition) => neutralDefinition(entry.file, definition, entry)),
  );
  appendAll(out.imports, importFacts(index, entry));
  appendAll(out.aliases, entryAliases);
}

export function collectSourceFacts(
  projectRoot: string,
  owners: ReadonlyMap<string, ReuseProject>,
): Pick<ReuseFacts, 'modules' | 'definitions' | 'imports'> {
  const index = buildIndex(projectRoot, owners);
  const out: SourceCollector = { modules: [], definitions: [], imports: [], aliases: [] };
  for (const [file, project] of owners) {
    collectFileFacts(index, readEntry(projectRoot, file, project), out);
  }
  return {
    modules: out.modules,
    definitions: out.definitions,
    imports: [...out.imports, ...out.aliases],
  };
}
