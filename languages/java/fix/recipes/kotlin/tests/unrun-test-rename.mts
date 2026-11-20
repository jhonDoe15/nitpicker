import type { RecipeFix } from '../../../../../../core/fix/typed/fix-types.mts';
import { TEST_DECLARATION } from '../../../../adapters/test-runtime/test-markers.mts';
import { isAbstract } from '../../../../adapters/test-runtime/test-sources.mts';
import { escapeRegExp, scanKotlinSource } from '../shared/kotlin-scan.mts';
import { projectRecipe, wordPattern } from '../shims/source-index.mts';
import type { Source } from '../shims/source-index.mts';

const RULE = { tool: 'test-runtime', rule: 'test-not-run' };
const KOTLIN_TEST = /(?:^|\/)src\/test\/kotlin\/(?:[^/]+\/)*([^/]+)\.kt$/u;
const FAILSAFE_NAME = /^IT(?=[A-Z])|IT$|ITCase$/u;
const COLLECTED_NAME = /^Test|Test$|Tests$|TestCase$/u;
const GRADLE_FILES = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
const DECLARATION = /^(?:[a-z]+[ \t]+)*(?:class|object|interface|fun|val|var|typealias)\b/gmu;

type Read = (name: string) => string | undefined;

function codeWord(name: string, flags: string): RegExp {
  return new RegExp(String.raw`(?<![\w\x60.])${escapeRegExp(name)}(?![\w\x60])`, flags);
}

function moduleRoots(file: string): string[] {
  const parts = file.split('/');
  const modules = parts.slice(0, Math.max(parts.lastIndexOf('src'), 0));
  return ['', ...modules.map((_, index) => `${modules.slice(0, index + 1).join('/')}/`)];
}

function runsOnlySurefire(file: string, read: Read): boolean {
  const roots = moduleRoots(file);
  const poms = roots.flatMap((root) => read(`${root}pom.xml`) ?? []);
  const gradle = roots.some((root) =>
    GRADLE_FILES.some((name) => read(`${root}${name}`) !== undefined),
  );
  return (
    poms.length > 0 &&
    !gradle &&
    poms.every(
      (pom) => !(pom.includes('maven-failsafe-plugin') || pom.includes('maven-surefire-plugin')),
    )
  );
}

function renamed(simple: string): string {
  return `${simple.replace(/^IT(?=[A-Z])/u, '').replace(/ITCase$|IT$/u, '')}Test`;
}

function declaresOnly(code: string, simple: string): boolean {
  return (
    [...code.matchAll(DECLARATION)].length === 1 &&
    new RegExp(String.raw`^(?:[a-z]+[ \t]+)*class[ \t]+${escapeRegExp(simple)}\b`, 'mu').test(code)
  );
}

function renameIn(text: string, from: string, to: string): string {
  const { code } = scanKotlinSource(text);
  return [...code.matchAll(codeWord(from, 'gu'))].reduceRight(
    (result, { index }) => `${result.slice(0, index)}${to}${result.slice(index + from.length)}`,
    text,
  );
}

type Context = {
  readonly sources: readonly Source[];
  readonly source: Source;
  readonly read: Read;
};

function declares(sources: readonly Source[], name: string): boolean {
  const pattern = new RegExp(
    String.raw`\b(?:class|object|interface|typealias)\s+${escapeRegExp(name)}\b`,
    'u',
  );
  return sources.some(({ text }) => pattern.test(text));
}

function mentioned(sources: readonly Source[], name: string, except: string): boolean {
  const word = wordPattern(name, 'u');
  return sources.some(({ path, text }) => path !== except && word.test(text));
}

function renameable({ sources, source, read }: Context, simple: string, target: string): boolean {
  const { path, text } = source;
  const to = path.replace(new RegExp(`${escapeRegExp(simple)}\\.kt$`, 'u'), `${target}.kt`);
  const { code } = scanKotlinSource(text);
  const inCode = [...code.matchAll(codeWord(simple, 'gu'))].length;
  const inText = [...text.matchAll(wordPattern(simple, 'gu'))].length;
  return (
    TEST_DECLARATION.test(text) &&
    !isAbstract(text, simple) &&
    declaresOnly(code, simple) &&
    runsOnlySurefire(path, read) &&
    read(to) === undefined &&
    !declares(sources, target) &&
    !wordPattern(target, 'u').test(text) &&
    inCode === inText &&
    !mentioned(sources, simple, path)
  );
}

function renameFix(context: Context): RecipeFix[] {
  const { path, text } = context.source;
  const simple = KOTLIN_TEST.exec(path)?.[1];
  if (simple === undefined || !FAILSAFE_NAME.test(simple) || COLLECTED_NAME.test(simple)) {
    return [];
  }
  const target = renamed(simple);
  if (!renameable(context, simple, target)) {
    return [];
  }
  const to = path.replace(new RegExp(`${escapeRegExp(simple)}\\.kt$`, 'u'), `${target}.kt`);
  return [
    {
      finding: { ...RULE, path, line: 1 },
      edits: [
        { type: 'write', path: to, text: renameIn(text, simple, target) },
        { type: 'delete', path },
      ],
    },
  ];
}

export const kotlinUnrunTestRenameRecipe = projectRecipe({
  id: 'kotlin-unrun-test-rename',
  rule: RULE,
  where: 'test',
  find: ({ sources, source, read }) =>
    read === undefined ? [] : renameFix({ sources, source, read }),
});
