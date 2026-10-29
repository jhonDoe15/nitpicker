import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { childAt, parseXml } from '../../../../../shared/ingest/common.mjs';
import { gradleStatements } from '../../../builds/narrowing/gradle-script.mjs';
import { buildFiles } from '../../../conventions/build-style/build-files.mjs';

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
  /^(?:\$\{?(?:rootDir|rootProject\.projectDir|project\.rootDir|rootProject\.rootDir)\}?)(?:\/|$)/u;
const PROJECT_PREFIX = /^(?:\$\{?(?:projectDir|project\.projectDir)\}?)(?:\/|$)/u;
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

function skipped(name, relative) {
  if (name.startsWith('.') || SKIPPED_DIRECTORIES.has(name)) {
    return true;
  }
  return name === 'src' && !LOGIC_ROOT.test(relative);
}

function relativeOf(directory, name) {
  return directory === '' ? name : `${directory}/${name}`;
}

function walk(root) {
  const found = [];
  const pending = [''];
  for (const directory of pending) {
    const entries = readdirSync(path.join(root, directory), { withFileTypes: true });
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory() && !skipped(entry.name, directory))
        .map((entry) => relativeOf(directory, entry.name))
        .filter((relative) => !existsSync(path.join(root, relative, '.git'))),
    );
    found.push(
      ...entries
        .filter((entry) => entry.isFile())
        .map((entry) => relativeOf(directory, entry.name)),
    );
  }
  return found;
}

function readSmall(file) {
  return existsSync(file) && statSync(file).size <= MAX_FILE_BYTES
    ? readFileSync(file, 'utf8')
    : undefined;
}

export function directorySource(root) {
  return {
    paths: () => walk(root),
    readMany: (files) =>
      new Map(
        files.flatMap((file) => {
          const text = readSmall(path.join(root, file));
          return text === undefined ? [] : [[file, text]];
        }),
      ),
  };
}

function scriptDirectory(file) {
  return LOGIC_ROOT.test(file) ? '.' : path.posix.dirname(file);
}

function parsedPom(file, text) {
  try {
    return { file, directory: path.posix.dirname(file), project: parseXml(text) };
  } catch (error) {
    return { file, directory: path.posix.dirname(file), failure: error.message };
  }
}

export function readDeclaredBuild(source) {
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

export function quotedStrings(text) {
  return [...text.matchAll(QUOTED)].map((match) => match[1] ?? match[2]);
}

function settingPattern(names) {
  return new RegExp(
    String.raw`(?<![\w$])(${names.join('|')})\s*(\+=|=(?!=)|\.(?:set|add|addAll|assign|value)\s*\(|\(|\s+(?=["'[]))`,
    'gu',
  );
}

export function gradleSettings(scripts, { context, skip, names }) {
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
            name: match[1],
            conditional: segments.some((segment) => CONDITIONAL.test(segment.trim())),
            text: statement.text,
            value: statement.text.slice(match.index + match[0].length),
          },
        ];
      }),
    ),
  );
}

function insideProject(relative) {
  const normalized = path.posix.normalize(relative);
  return normalized.startsWith('..') ||
    path.posix.isAbsolute(normalized) ||
    normalized.includes('$')
    ? undefined
    : normalized;
}

export function gradlePath({ value, directory }) {
  const [literal] = quotedStrings(value);
  if (literal === undefined) {
    return undefined;
  }
  const fromRoot = ROOT_PREFIX.test(literal) || ROOT_RECEIVER.test(value.split(literal)[0]);
  const relative = literal.replace(ROOT_PREFIX, '').replace(PROJECT_PREFIX, '');
  const inside = insideProject(relative);
  if (inside === undefined) {
    return undefined;
  }
  return fromRoot || directory === '.' ? inside : path.posix.join(directory, inside);
}

function ancestors(directory) {
  const parts = directory === '.' ? [] : directory.split('/');
  return [...parts.map((_, index) => parts.slice(0, parts.length - index).join('/')), '.'];
}

function propertyOf(poms, directory, name) {
  for (const owner of ancestors(directory)) {
    const pom = poms.find((candidate) => candidate.directory === owner);
    const value = pom?.project === undefined ? undefined : childAt(pom.project, 'properties', name);
    if (value?.text !== undefined) {
      return value.text.trim();
    }
  }
  return undefined;
}

function interpolated(poms, pom, text) {
  return text.replaceAll(PROPERTY, (whole, name) => {
    if (MAVEN_BASEDIR.has(name)) {
      return MODULE_MARK;
    }
    if (MAVEN_ROOT.has(name)) {
      return ROOT_MARK;
    }
    return propertyOf(poms, pom.directory, name) ?? whole;
  });
}

function marked(poms, pom, text) {
  return interpolated(poms, pom, interpolated(poms, pom, text.trim()));
}

export function mavenText(poms, pom, text) {
  return text === undefined
    ? undefined
    : marked(poms, pom, text).replaceAll(MODULE_MARK, pom.directory).replaceAll(ROOT_MARK, '.');
}

function withoutMark(value, mark) {
  return value.slice(mark.length).replace(/^\//u, '');
}

export function mavenPath(poms, pom, text) {
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

export function declarationText(declaration) {
  return declaration.value === undefined
    ? declaration.setting
    : `${declaration.setting} ${declaration.value}`;
}
