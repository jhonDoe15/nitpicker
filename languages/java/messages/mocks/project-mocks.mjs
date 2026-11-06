import path from 'node:path';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../adapters/review-rules/java-sources.mjs';
import { candidatesOf, declaredIn } from '../latency-fakes.mjs';

export const MOCKED_SUBJECT_RULE = 'MockedSubjectInTest';
export const STATIC_MOCK_RULE = 'StaticMockOfProjectType';
const GENERIC_TYPES = {
  [MOCKED_SUBJECT_RULE]: 'the class it tests',
  [STATIC_MOCK_RULE]: 'a class of this project',
};
const TYPE_NAME = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/u;
const WILDCARD_IMPORT = /^\s*import\s+([\w.]+)\.\*\s*;/gmu;
const NOT_MAIN = /(?:^|\/)src\/(?!main\/|\w+Main\/)[^/]+\/|^tests?\//u;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const KOTLIN_FACADE = /Kt$/u;
const CLASS_LITERAL = /\.class$/u;

function typeAt(text, location) {
  if (location?.column === undefined) {
    return undefined;
  }
  return TYPE_NAME.exec(text.slice(offsetOf(text, location)))?.[0]
    .replaceAll(/\s+/gu, '')
    .replace(CLASS_LITERAL, '');
}

function wildcardCandidates(name, text) {
  return [...text.matchAll(WILDCARD_IMPORT)].map((match) => `${match[1]}.${name}`);
}

function projectMainFiles(projectRoot) {
  const files = sourceFilesUnder(projectRoot, SOURCE_EXTENSIONS)
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .filter((file) => !NOT_MAIN.test(file))
    .map((file) => file.replace(/\.(?:java|kt)$/u, '').toLowerCase());
  return new Set(files.flatMap((file) => [file, ...suffixesOf(file)]));
}

function suffixesOf(file) {
  const parts = file.split('/');
  return parts.slice(1).map((_, index) => parts.slice(index + 1).join('/'));
}

function projectResolver({ projectRoot, mainRoots }) {
  const inRoots = declaredIn(mainRoots, projectRoot);
  let files;
  return (qualified) => {
    if (inRoots(qualified)) {
      return true;
    }
    files ??= projectMainFiles(projectRoot);
    const parts = qualified.split('.');
    return parts.some((_, index) => {
      const file = parts.slice(0, parts.length - index).join('/');
      return [file, file.replace(KOTLIN_FACADE, '')].some((name) => files.has(name.toLowerCase()));
    });
  };
}

function projectType(finding, { projectRoot, isProject }) {
  const text = readJavaSource(pathInside(projectRoot, finding.path));
  const name = text === undefined ? undefined : typeAt(text, finding.location);
  if (name === undefined) {
    return undefined;
  }
  const candidates = [...candidatesOf(name, text), ...wildcardCandidates(name, text)];
  return candidates.some(isProject) ? name.split('.').at(-1) : undefined;
}

function isMockRule(finding) {
  return finding.tool === 'pmd' && Object.hasOwn(GENERIC_TYPES, finding.rule);
}

export function withProjectTypeMocks(findings, { projectRoot, mainRoots = [] }) {
  if (projectRoot === undefined || !findings.some(isMockRule)) {
    return findings;
  }
  const context = { projectRoot, isProject: projectResolver({ projectRoot, mainRoots }) };
  return findings.flatMap((finding) => {
    if (!isMockRule(finding)) {
      return [finding];
    }
    const type = projectType(finding, context);
    const generic = GENERIC_TYPES[finding.rule];
    return type === undefined
      ? []
      : [{ ...finding, message: finding.message.replace(generic, `${type}, ${generic}`) }];
  });
}
