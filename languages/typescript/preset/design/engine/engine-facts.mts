import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { runTypedChecks } from '../../../adapters/typed-engine/typed-checks.mts';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';
import { fileEntry } from '../../unused-api/context.mts';
import { engineProjectConfig } from '../../unused-api/engine/project-inputs.mts';
import { projectProgramInputs } from '../../unused-api/program.mts';
import { globMatcher } from '../../unused-api/test-only/typed/layout-views.mts';
import type { PackagesInfo } from '../../unused-api/workspace/workspace-types.mts';
import type {
  CallableFact,
  DesignFacts,
  Fact,
  ModuleFact,
  TypeFact,
  TypeKind,
} from '../design-types.mts';
import { type PublishedNames, publishedNames } from '../publication.mts';
import type { DesignLayout, Frameworks } from '../typed/views.mts';

type Request = {
  readonly projectRoot: string;
  readonly configPath: string;
  readonly packagesInfo: PackagesInfo;
  readonly layout: DesignLayout;
  readonly frameworks: Frameworks | undefined;
  readonly environment: NodeJS.ProcessEnv;
};

type Owned = { readonly fileName: string; readonly path: string };

const ts = typescriptApi();
const CHECK = 'design';
const TYPE_KINDS: readonly TypeKind[] = ['module', 'class', 'data', 'enum', 'interface'];
const CALLABLE_KINDS: readonly CallableFact['kind'][] = [
  'function',
  'method',
  'constructor',
  'accessor',
];
const DECLARATION_FILE = /\.d\.(?:[cm]?ts|[^./]+\.ts)$/u;
const GENERATED_MARKER =
  /@generated|auto-?generated|generated (?:by|from|file)|do not (?:edit|modify)/iu;
const HEADER_LENGTH = 1000;

function isGeneratedFile(fileName: string): boolean {
  return GENERATED_MARKER.test((ts.sys.readFile(fileName) ?? '').slice(0, HEADER_LENGTH));
}

function ownedFiles(rootNames: readonly string[], request: Request): Owned[] {
  const { layout } = request;
  return rootNames
    .filter((fileName) => !DECLARATION_FILE.test(fileName))
    .toSorted((left, right) => left.localeCompare(right))
    .flatMap((fileName) => {
      const info = fileEntry({ ...request, fileName });
      const owned =
        info.insideProject &&
        info.role === 'production' &&
        layout.isSourceFile(info.path) &&
        !layout.isGeneratedPath(info.path) &&
        !isGeneratedFile(fileName);
      return owned ? [{ fileName, path: info.path }] : [];
    });
}

function moduleFacts(files: readonly Owned[], layout: DesignLayout): ModuleFact[] {
  const entries = (layout.entryPoints ?? []).map((glob) => globMatcher(glob));
  return files.map((file) => ({
    file: file.path,
    role: 'production',
    ...(entries.some((matcher) => matcher.test(file.path)) ? { entry: true } : {}),
  }));
}

function isPublished(value: unknown, published: PublishedNames | undefined): boolean {
  if (published === undefined) {
    return false;
  }
  const moduleFile = fieldOf(value, 'moduleFile');
  if (typeof moduleFile === 'string') {
    return published.isWholeFile(moduleFile);
  }
  const exportedAs = fieldOf(value, 'exportedAs');
  const file = String(fieldOf(exportedAs, 'file'));
  return textsOf(fieldOf(exportedAs, 'names')).some((name) => published.isCoveredName(file, name));
}

function factFields(value: unknown, published: PublishedNames | undefined): Fact {
  const entries = Object.entries(Object(value)).filter(
    ([name]) => name !== 'moduleFile' && name !== 'exportedAs',
  );
  return Object.fromEntries(
    isPublished(value, published) ? [...entries, ['published', true]] : entries,
  );
}

function identityOf(value: unknown): Pick<TypeFact, 'id' | 'file' | 'name' | 'line' | 'exported'> {
  return {
    id: String(fieldOf(value, 'id')),
    file: String(fieldOf(value, 'file')),
    name: String(fieldOf(value, 'name')),
    line: Number(fieldOf(value, 'line')),
    exported: fieldOf(value, 'exported') === true,
  };
}

function typeFactOf(value: unknown, published: PublishedNames | undefined): TypeFact {
  const kind = TYPE_KINDS.find((known) => known === fieldOf(value, 'kind')) ?? 'data';
  return { ...factFields(value, published), ...identityOf(value), kind };
}

function callableFactOf(value: unknown, published: PublishedNames | undefined): CallableFact {
  const kind = CALLABLE_KINDS.find((known) => known === fieldOf(value, 'kind')) ?? 'function';
  return { ...factFields(value, published), ...identityOf(value), kind };
}

export function engineDesignFacts(request: Request): DesignFacts | undefined {
  const { projectRoot, configPath, layout, frameworks } = request;
  if (path.dirname(path.resolve(configPath)) !== path.resolve(projectRoot)) {
    return undefined;
  }
  const inputs = projectProgramInputs(request);
  const files = ownedFiles(inputs.rootNames, request);
  const defaults = (frameworks?.defaultExports ?? []).map((glob) => globMatcher(glob));
  const published = publishedNames(request);
  const outcome = runTypedChecks({
    project(folder) {
      const generated = path.join(folder, 'tsconfig.json');
      writeFileSync(generated, JSON.stringify(engineProjectConfig(inputs, request)));
      return generated;
    },
    checks: [CHECK],
    inputs: {
      [CHECK]: {
        files: files.map((file) => [
          file.fileName,
          {
            path: file.path,
            frameworkDefault: defaults.some((matcher) => matcher.test(file.path)),
          },
        ]),
        anySpecifier: Reflect.get(inputs.options, 'baseUrl') !== undefined,
        pathPrefixes: Object.keys(inputs.options.paths ?? {}).map((pattern) =>
          pattern.endsWith('*') ? pattern.slice(0, -1) : pattern,
        ),
        published: published !== undefined,
      },
    },
    environment: { ...process.env, ...request.environment },
  });
  const result = outcome.checks?.[CHECK];
  if (result === undefined) {
    return undefined;
  }
  return {
    modules: moduleFacts(files, layout),
    types: listOf(fieldOf(result, 'types')).map((fact) => typeFactOf(fact, published)),
    callables: listOf(fieldOf(result, 'callables')).map((fact) => callableFactOf(fact, published)),
  };
}
