import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { childAt, parseXml } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import { configurations, pluginsNamed } from '../../../builds/narrowing/maven-sources.mts';
import type {
  BuildSource,
  DeclaredBuild,
  Declaration,
  FoundSetting,
  GradleSettingOptions,
  Pom,
  Script,
} from './declared-types.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { messageOf, textOf } from '../../../../../shared/values/readers.mts';
import { gradleStatements, quotedGroups } from '../../../builds/narrowing/gradle-script.mts';
import { buildFiles } from '../../../conventions/build-style/build-files.mts';
import { appendAll } from '../../../../../shared/lists/items.mjs';

const escapeRegExp: (text: string) => string = untypedEscapeRegExp;

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'build',
  'target',
  'out',
  'fixtures',
  'testdata',
]);
const LOGIC_ROOT = /^(?:buildSrc|build-logic)(?:\/|$)/u;
const MAX_FILE_BYTES = 512 * 1024;
const QUOTED = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/gu;
const ROOT_PREFIX =
  /^\$\{?(?:rootDir|rootProject\.projectDir|project\.rootDir|rootProject\.rootDir)\}?(?:\/|$)/u;
const PROJECT_PREFIX = /^\$\{?(?:projectDir|project\.projectDir)\}?(?:\/|$)/u;
const ROOT_RECEIVER = /\brootProject\b|\brootDir\b|\bisolated\.rootProject\b/u;
const MAVEN_ROOT = new Set([
  'maven.multiModuleProjectDirectory',
  'session.executionRootDirectory',
  'maven.rootdir',
]);
const MAVEN_BASEDIR = new Set(['project.basedir', 'basedir']);
const PROPERTY = /\$\{([^}]+)\}/gu;
const ROOT_MARK = '\u0000root';
const MODULE_MARK = '\u0000module';
const CONDITIONAL = /^(?:if|when|else|onlyIf)\b/u;

function skipped(name: string, relative: string): boolean {
  if (name.startsWith('.') || SKIPPED_DIRECTORIES.has(name)) {
    return true;
  }
  return name === 'src' && !LOGIC_ROOT.test(relative);
}

function relativeOf(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`;
}

function walk(root: string): string[] {
  const found: string[] = [];
  const pending = [''];
  for (const directory of pending) {
    const entries = readdirSync(path.join(root, directory), { withFileTypes: true });
    if (directory !== '' && entries.some((entry) => entry.name === '.git')) {
      continue;
    }
    appendAll(
      pending,
      entries
        .filter((entry) => entry.isDirectory() && !skipped(entry.name, directory))
        .map((entry) => relativeOf(directory, entry.name)),
    );
    appendAll(
      found,
      entries.filter((entry) => entry.isFile()).map((entry) => relativeOf(directory, entry.name)),
    );
  }
  return found;
}

function readSmall(file: string): string | undefined {
  return existsSync(file) && statSync(file).size <= MAX_FILE_BYTES
    ? readFileSync(file, 'utf8')
    : undefined;
}

export function directorySource(root: string): BuildSource {
  return {
    paths: () => walk(root),
    readMany: (files) =>
      new Map(
        files.flatMap((file): [string, string][] => {
          const text = readSmall(path.join(root, file));
          return text === undefined ? [] : [[file, text]];
        }),
      ),
  };
}

function scriptDirectory(file: string): string {
  return LOGIC_ROOT.test(file) ? '.' : path.posix.dirname(file);
}

function parsedPom(file: string, text: string): Pom {
  try {
    return { file, directory: path.posix.dirname(file), project: parseXml(text) };
  } catch (error) {
    return { file, directory: path.posix.dirname(file), failure: messageOf(error) };
  }
}

export function readDeclaredBuild(source: BuildSource): DeclaredBuild {
  const { files } = buildFiles(source);
  return {
    scripts: files
      .filter(({ kind, file }) => kind === 'code' && !/(?:^|\/)settings\.gradle/u.test(file))
      .map(({ file, text }) => ({
        file,
        directory: scriptDirectory(file),
        statements: gradleStatements(text),
      })),
    poms: files
      .filter(({ file }) => file === 'pom.xml' || file.endsWith('/pom.xml'))
      .map(({ file, text }) => parsedPom(file, text)),
  };
}

export function quotedStrings(text: string): string[] {
  return quotedGroups(text, QUOTED);
}

function settingPattern(names: readonly string[]): RegExp {
  return new RegExp(
    String.raw`(?<![\w$])(${names.map(escapeRegExp).join('|')})\s*(\+=|=(?!=)|\.(?:set|add|addAll|assign|value)\s*\(|\(|\s+(?=["'[]))`,
    'gu',
  );
}

export function gradleSettings(
  scripts: readonly Script[],
  { context, skip, names }: GradleSettingOptions,
): FoundSetting[] {
  const pattern = settingPattern(names);
  return scripts.flatMap((script) =>
    script.statements.flatMap((statement) =>
      [...statement.text.matchAll(pattern)].flatMap((match) => {
        const segments = [...statement.path, statement.text.slice(0, match.index)];
        const before = segments.join('.');
        if (!context.test(before) || skip?.test(before) === true) {
          return [];
        }
        return [
          {
            file: script.file,
            directory: script.directory,
            name: match[1] ?? '',
            conditional: segments.some((segment) => CONDITIONAL.test(segment.trim())),
            text: statement.text,
            value: statement.text.slice(match.index + match[0].length),
          },
        ];
      }),
    ),
  );
}

function insideProject(relative: string): string | undefined {
  const normalized = path.posix.normalize(relative);
  return normalized.startsWith('..') ||
    path.posix.isAbsolute(normalized) ||
    normalized.includes('$')
    ? undefined
    : normalized;
}

export function gradlePath({
  value,
  directory,
}: {
  value: string;
  directory: string;
}): string | undefined {
  const [literal] = quotedStrings(value);
  if (literal === undefined) {
    return undefined;
  }
  const fromRoot = ROOT_PREFIX.test(literal) || ROOT_RECEIVER.test(value.split(literal)[0] ?? '');
  const relative = literal.replace(ROOT_PREFIX, '').replace(PROJECT_PREFIX, '');
  const inside = insideProject(relative);
  if (inside === undefined) {
    return undefined;
  }
  return fromRoot || directory === '.' ? inside : path.posix.join(directory, inside);
}

function ancestors(directory: string): string[] {
  const parts = directory === '.' ? [] : directory.split('/');
  return [...parts.map((_, index) => parts.slice(0, parts.length - index).join('/')), '.'];
}

function propertyOf(poms: readonly Pom[], directory: string, name: string): string | undefined {
  for (const owner of ancestors(directory)) {
    const pom = poms.find((candidate) => candidate.directory === owner);
    const value = pom?.project === undefined ? undefined : childAt(pom.project, 'properties', name);
    if (value?.text !== undefined) {
      return value.text.trim();
    }
  }
  return undefined;
}

function interpolated(poms: readonly Pom[], pom: Pom, text: string): string {
  return text.replaceAll(PROPERTY, (whole: string, name: string) => {
    if (MAVEN_BASEDIR.has(name)) {
      return MODULE_MARK;
    }
    if (MAVEN_ROOT.has(name)) {
      return ROOT_MARK;
    }
    return propertyOf(poms, pom.directory, name) ?? whole;
  });
}

function marked(poms: readonly Pom[], pom: Pom, text: string): string {
  return interpolated(poms, pom, interpolated(poms, pom, text.trim()));
}

export function mavenText(poms: readonly Pom[], pom: Pom, text: string): string;
export function mavenText(
  poms: readonly Pom[],
  pom: Pom,
  text: string | undefined,
): string | undefined;
export function mavenText(
  poms: readonly Pom[],
  pom: Pom,
  text: string | undefined,
): string | undefined {
  return text === undefined
    ? undefined
    : marked(poms, pom, text).replaceAll(MODULE_MARK, pom.directory).replaceAll(ROOT_MARK, '.');
}

function withoutMark(value: string, mark: string): string {
  return value.slice(mark.length).replace(/^\//u, '');
}

export function mavenPath(poms: readonly Pom[], pom: Pom, text: string): string | undefined {
  const value = marked(poms, pom, text);
  if (value.includes('${') || value.startsWith('classpath:')) {
    return undefined;
  }
  if (value.startsWith(ROOT_MARK)) {
    return insideProject(withoutMark(value, ROOT_MARK));
  }
  const relative = value.startsWith(MODULE_MARK) ? withoutMark(value, MODULE_MARK) : value;
  return insideProject(path.posix.join(pom.directory, relative));
}

export function declarationText(declaration: Pick<Declaration, 'setting' | 'value'>): string {
  return declaration.value === undefined
    ? declaration.setting
    : `${declaration.setting} ${textOf(declaration.value)}`;
}

export function mavenPluginDeclarations(
  poms: readonly Pom[],
  plugins: ReadonlySet<string>,
  declare: (found: {
    readonly poms: readonly Pom[];
    readonly pom: Pom;
    readonly configuration: XmlElement;
  }) => Declaration[],
): Declaration[] {
  return poms
    .flatMap((pom) => (pom.project === undefined ? [] : [{ ...pom, project: pom.project }]))
    .flatMap((pom) =>
      pluginsNamed(pom.project, plugins)
        .flatMap((plugin) => configurations(plugin))
        .flatMap((configuration) => declare({ poms, pom, configuration })),
    );
}
