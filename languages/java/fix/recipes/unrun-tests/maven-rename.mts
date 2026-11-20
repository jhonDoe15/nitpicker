import type { RecipeFix } from '../../../../../core/fix/typed/fix-types.mts';
import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import { maskedOf } from '../source/java-text.mts';
import type { Planned, TestClassFile } from './gradle-task.mts';

type Text = { readonly path: string; readonly text: string };
type Renaming = {
  readonly file: TestClassFile;
  readonly texts: readonly Text[];
  readonly failsafeBuilt: boolean;
};

const RULE = { tool: 'test-runtime', rule: 'test-not-run' };
export const FAILSAFE_NAME = /^IT|IT$|ITCase$/u;
export const COLLECTED_NAME = /(?:Test|Tests|TestCase)$|^Test/u;

function collectedName(simple: string): string | undefined {
  const base = simple.replace(/^IT(?=[A-Z])/u, '').replace(/(?:ITCase|IT)$/u, '');
  const renamed = `${base}IntegrationTest`;
  return base === '' ||
    base === simple ||
    !COLLECTED_NAME.test(renamed) ||
    FAILSAFE_NAME.test(renamed)
    ? undefined
    : renamed;
}

function directoryOf(name: string): string {
  return name.slice(0, name.lastIndexOf('/') + 1);
}

function mentioning(texts: readonly Text[], own: string, simple: string): string | undefined {
  const word = new RegExp(String.raw`\b${escapeRegExp(simple)}\b`, 'u');
  return texts.find(({ path, text }) => path !== own && word.test(text))?.path;
}

export function mavenRename({ file, texts, failsafeBuilt }: Renaming): Planned {
  const simple = file.path.slice(file.path.lastIndexOf('/') + 1).replace(/\.java$/u, '');
  const renamed = collectedName(simple);
  const target = `${directoryOf(file.path)}${renamed ?? ''}.java`;
  const word = new RegExp(String.raw`\b${escapeRegExp(simple)}\b`, 'gu');
  const { code, literals } = maskedOf(file.text);
  const inString = [...literals.matchAll(word)].length !== [...code.matchAll(word)].length;
  const other = mentioning(texts, file.path, simple);
  const problem =
    (failsafeBuilt ? 'a pom of the project configures Failsafe or Surefire' : undefined) ??
    (renamed === undefined ? `${simple} has no name that Surefire collects` : undefined) ??
    (texts.some(({ path }) => path === target) ? `${target} exists` : undefined) ??
    (inString ? `${simple} appears in a string of the class` : undefined) ??
    (other === undefined ? undefined : `${other} mentions ${simple}`);
  if (problem !== undefined || renamed === undefined) {
    return { declined: problem ?? '' };
  }
  const fix: RecipeFix = {
    finding: { ...RULE, path: file.path, line: 1 },
    edits: [
      { type: 'write', path: target, text: file.text.replace(word, renamed) },
      { type: 'delete', path: file.path },
    ],
  };
  return { fix };
}
