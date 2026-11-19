import path from 'node:path';
import { readSpringDocuments } from '../spring-config-files.mts';
import { relaxKey } from '../spring-config-parser.mts';
import { testResourceRoots } from '../spring-profiles.mts';
import { propertyClassKeys } from './classes/property-classes.mts';
import { knownKeys, unboundKey } from './known-keys.mts';
import { readClasspathMetadata } from './metadata/classpath-metadata.mts';
import { referencedKeys, sourcesUnder } from './source-keys.mts';
import { testOverrideKeys } from './test-overrides.mts';
import type { SpringDocument } from '../typed/config-types.mts';
import type { SpringProblem } from '../typed/spring-types.mts';
import type {
  KnownIndex,
  KnownIndexInput,
  UnboundOptions,
  UnboundSource,
  Verdict,
  WrittenKey,
} from '../typed/unbound-types.mts';

const UNDECLARED_ROUTE =
  'Declare a key that code reads by name in META-INF/additional-spring-configuration-metadata.json.';

export function judgedKey(written: string): string {
  const relaxed = relaxKey(written.trim());
  const end = relaxed.search(/[^a-z\d.]/u);
  return (end < 0 ? relaxed : relaxed.slice(0, end)).replace(/\.+$/u, '');
}

function messageOf(written: string, verdict: Verdict): string {
  if (verdict.removed) {
    const replacement =
      verdict.replacement === undefined ? 'remove it' : `use ${verdict.replacement}`;
    return `${written} was removed from Spring Boot and binds to nothing; ${replacement}.`;
  }
  const fix =
    verdict.replacement === undefined
      ? `use a key that the ${verdict.prefix ?? ''} properties define.`
      : `did you mean ${verdict.replacement}?`;
  return `${written} binds to no property, so Spring ignores it; ${fix} ${UNDECLARED_ROUTE}`;
}

function documentKeys(documents: readonly SpringDocument[]): WrittenKey[] {
  return documents.flatMap((document) =>
    document.entries.map((entry) => ({ path: document.path, line: entry.line, key: entry.key })),
  );
}

function overrideKeys(projectRoot: string, sources: readonly UnboundSource[]): WrittenKey[] {
  return sources.flatMap((source) =>
    testOverrideKeys(source).map(({ key, line }) => ({
      path: path.relative(projectRoot, source.file).replaceAll('\\', '/'),
      line,
      key,
    })),
  );
}

function knownIndex({
  projectRoot,
  classpath,
  roots,
  sources,
}: KnownIndexInput): KnownIndex | undefined {
  const metadata = readClasspathMetadata(
    classpath,
    roots.resources.map((root) => path.join(projectRoot, root)),
  );
  return metadata.boot
    ? knownKeys({
        metadata,
        classes: propertyClassKeys(sources),
        references: referencedKeys({ projectRoot, sources, resourceRoots: roots.resources }),
      })
    : undefined;
}

function uniqueByLine(keys: readonly WrittenKey[]): WrittenKey[] {
  const seen = new Set<string>();
  return keys.filter(({ path: file, line, key }) => {
    const id = `${file}\0${String(line)}\0${judgedKey(key)}`;
    const fresh = !seen.has(id);
    seen.add(id);
    return fresh;
  });
}

export function unboundPropertyProblems(
  projectRoot: string,
  { classpath = [], sourceRoots, testSourceRoots, resourceRoots }: UnboundOptions,
): SpringProblem[] {
  const testResources = testResourceRoots(testSourceRoots);
  const roots = { resources: [...resourceRoots, ...testResources] };
  const testSources = sourcesUnder(projectRoot, testSourceRoots);
  const sources = [...sourcesUnder(projectRoot, sourceRoots), ...testSources];
  const index = knownIndex({ projectRoot, classpath, roots, sources });
  if (index === undefined) {
    return [];
  }
  const written = [
    ...documentKeys(readSpringDocuments(projectRoot, roots.resources)),
    ...overrideKeys(projectRoot, testSources),
  ];
  return uniqueByLine(written).flatMap(({ path: file, line, key }) => {
    const judged = judgedKey(key);
    const verdict = judged === '' ? undefined : unboundKey(index, judged);
    return verdict === undefined
      ? []
      : [{ path: file, line, key: judged, message: messageOf(key.trim(), verdict) }];
  });
}
