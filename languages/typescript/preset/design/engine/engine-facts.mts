import { readFileSync } from 'node:fs';
import path from 'node:path';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { valueOr } from '../../../../../shared/values/attempt/attempt.mts';
import type { EnginePart } from '../../unused-api/engine/typed-plans.mts';
import { fieldOf, fieldsOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';
import { fileEntry } from '../../unused-api/context.mts';
import { engineProjectConfig } from '../../unused-api/engine/project-inputs.mts';
import { projectProgramInputs } from '../../unused-api/program.mts';
import { globMatcher } from '../../unused-api/test-only/typed/layout-views.mts';
import type { PackagesInfo } from '../../unused-api/workspace/workspace-types.mts';
import type { CallableFact, DesignFacts, Fact, TypeFact, TypeKind } from '../design-types.mts';
import { moduleFacts } from '../project.mts';
import { type PublishedNames, publishedNames } from '../publication.mts';
import type { DesignLayout, Frameworks } from '../typed/views.mts';

type Request = {
  readonly projectRoot: string;
  readonly configPath: string;
  readonly packagesInfo: PackagesInfo;
  readonly layout: DesignLayout;
  readonly frameworks: Frameworks | undefined;
  readonly environment: Environment;
};

type Owned = { readonly fileName: string; readonly path: string };

const ts = typescriptApi();
const CHECK = 'design';
const TYPE_KINDS = ['data', 'module', 'class', 'enum', 'interface'] as const satisfies TypeKind[];
const CALLABLE_KINDS = [
  'function',
  'method',
  'constructor',
  'accessor',
] as const satisfies CallableFact['kind'][];
const DECLARATION_FILE = /\.d\.(?:[cm]?ts|[^./]+\.ts)$/u;
const GENERATED_MARKER =
  /@generated|auto-?generated|generated (?:by|from|file)|do not (?:edit|modify)/iu;
const HEADER_LENGTH = 1000;
const SCRIPT_FILE = /\.[cm]?jsx?$/u;
const TYPED_TAGS = ['param', 'arg', 'argument', 'returns?', 'this', 'satisfies', 'implements'].join(
  '|',
);
const DECLARING_TAGS = ['type', 'typedef', 'callback', 'template', 'overload', 'import'].join('|');
const DOCUMENTATION_TYPE = new RegExp(
  `@(?:(?:${TYPED_TAGS})\\s*\\{|(?:${DECLARING_TAGS})\\b)`,
  'u',
);
const COMMENT_START = '/**';
const COMMENT_END = '*/';

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

function hasTypedComment(text: string): boolean {
  const starts = [text.indexOf(COMMENT_START)];
  for (const start of starts) {
    if (start === -1) {
      return false;
    }
    const end = text.indexOf(COMMENT_END, start + COMMENT_START.length - 1);
    if (DOCUMENTATION_TYPE.test(text.slice(start, end === -1 ? text.length : end))) {
      return true;
    }
    if (end !== -1) {
      starts.push(text.indexOf(COMMENT_START, end + COMMENT_END.length));
    }
  }
  return false;
}

function declaresDocumentationTypes({ fileName }: Owned): boolean {
  return (
    SCRIPT_FILE.test(fileName) && hasTypedComment(valueOr(() => readFileSync(fileName, 'utf8'), ''))
  );
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
  const entries = Object.entries(fieldsOf(value)).filter(
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

function factsOf<Kind extends string>(
  values: unknown,
  published: PublishedNames | undefined,
  kinds: readonly [Kind, ...Kind[]],
): (Fact & ReturnType<typeof identityOf> & { readonly kind: Kind })[] {
  return listOf(values).map((value) => ({
    ...factFields(value, published),
    ...identityOf(value),
    kind: kinds.find((known) => known === fieldOf(value, 'kind')) ?? kinds[0],
  }));
}

export function engineDesignPart(request: Request): EnginePart<DesignFacts> | undefined {
  const { projectRoot, configPath, layout, frameworks } = request;
  if (path.dirname(path.resolve(configPath)) !== path.resolve(projectRoot)) {
    return undefined;
  }
  const inputs = projectProgramInputs(request);
  const files = ownedFiles(inputs.rootNames, request);
  if (files.some(declaresDocumentationTypes)) {
    return undefined;
  }
  const defaults = (frameworks?.defaultExports ?? []).map((glob) => globMatcher(glob));
  const published = publishedNames(request);
  return {
    part: {
      check: CHECK,
      input: {
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
      project: engineProjectConfig(inputs, request),
    },
    read: (result) => ({
      modules: moduleFacts(files, layout),
      types: factsOf(fieldOf(result, 'types'), published, TYPE_KINDS),
      callables: factsOf(fieldOf(result, 'callables'), published, CALLABLE_KINDS),
    }),
  };
}
