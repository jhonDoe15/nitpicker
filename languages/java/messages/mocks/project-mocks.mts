import path from 'node:path';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../adapters/review-rules/java-sources.mts';
import { candidatesOf, declaredIn } from '../latency-fakes.mts';

export const MOCKED_SUBJECT_RULE = 'MockedSubjectInTest';
export const STATIC_MOCK_RULE = 'StaticMockOfProjectType';
type MockFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly location?: { readonly line: number; readonly column?: number } | undefined;
};
type MockContext = { projectRoot: string; isProject: (qualified: string) => boolean };

const GENERIC_TYPES: Record<string, string> = {
  [MOCKED_SUBJECT_RULE]: 'the class it tests',
  [STATIC_MOCK_RULE]: 'a class of this project',
};
const TYPE_NAME = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/u;
const WILDCARD_IMPORT = /^\s*import\s+([\w.]+)\.\*\s*;/gmu;
const NOT_MAIN = /(?:^|\/)src\/(?!main\/|\w+Main\/)[^/]+\/|^tests?\//u;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const KOTLIN_FACADE = /Kt$/u;
const CLASS_LITERAL = /\.class$/u;

function typeAt(text: string, location: MockFinding['location']): string | undefined {
  if (location?.column === undefined) {
    return undefined;
  }
  return TYPE_NAME.exec(text.slice(offsetOf(text, location)))?.[0]
    .replaceAll(/\s+/gu, '')
    .replace(CLASS_LITERAL, '');
}

function wildcardCandidates(name: string, text: string): string[] {
  return [...text.matchAll(WILDCARD_IMPORT)].map((match) => `${match[1] ?? ''}.${name}`);
}

function projectMainFiles(projectRoot: string): Set<string> {
  const files = sourceFilesUnder(projectRoot, SOURCE_EXTENSIONS)
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .filter((file) => !NOT_MAIN.test(file))
    .map((file) => file.replace(/\.(?:java|kt)$/u, '').toLowerCase());
  return new Set(files.flatMap((file) => [file, ...suffixesOf(file)]));
}

function suffixesOf(file: string): string[] {
  const parts = file.split('/');
  return parts.slice(1).map((_, index) => parts.slice(index + 1).join('/'));
}

function projectResolver({
  projectRoot,
  mainRoots,
}: {
  projectRoot: string;
  mainRoots: readonly string[];
}): (qualified: string) => boolean {
  const inRoots = declaredIn(mainRoots, projectRoot);
  let files: Set<string> | undefined;
  return (qualified) => {
    if (inRoots(qualified)) {
      return true;
    }
    const known = (files ??= projectMainFiles(projectRoot));
    const parts = qualified.split('.');
    return parts.some((_, index) => {
      const file = parts.slice(0, parts.length - index).join('/');
      return [file, file.replace(KOTLIN_FACADE, '')].some((name) => known.has(name.toLowerCase()));
    });
  };
}

function projectType(
  finding: MockFinding,
  { projectRoot, isProject }: MockContext,
): string | undefined {
  const text = readJavaSource(pathInside(projectRoot, finding.path));
  const name = text === undefined ? undefined : typeAt(text, finding.location);
  if (name === undefined) {
    return undefined;
  }
  const candidates = [...candidatesOf(name, text ?? ''), ...wildcardCandidates(name, text ?? '')];
  return candidates.some(isProject) ? name.split('.').at(-1) : undefined;
}

function isMockRule(finding: MockFinding): boolean {
  return finding.tool === 'pmd' && Object.hasOwn(GENERIC_TYPES, finding.rule);
}

export function withProjectTypeMocks<Finding extends MockFinding>(
  findings: Finding[],
  {
    projectRoot,
    mainRoots = [],
  }: { projectRoot: string | undefined; mainRoots?: readonly string[] },
): Finding[] {
  if (projectRoot === undefined || !findings.some(isMockRule)) {
    return findings;
  }
  const context: MockContext = {
    projectRoot,
    isProject: projectResolver({ projectRoot, mainRoots }),
  };
  return findings.flatMap((finding) => {
    if (!isMockRule(finding)) {
      return [finding];
    }
    const type = projectType(finding, context);
    const generic = GENERIC_TYPES[finding.rule] ?? '';
    return type === undefined
      ? []
      : [{ ...finding, message: finding.message.replace(generic, `${type}, ${generic}`) }];
  });
}
