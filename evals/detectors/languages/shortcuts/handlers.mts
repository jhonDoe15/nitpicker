import type { Language } from '../../common/types.mts';

const CONSTANT = String.raw`[A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)*`;
const EMPTY_CALL = String.raw`(?:\w+\.)?(?:empty\w*|listOf|setOf|mapOf|of)\(\)`;
const QUOTED = String.raw`(["'])\s*\1`;
const NUMBER = String.raw`-?\d[\w.]*`;
const PYTHON_VALUE = String.raw`None|True|False|${NUMBER}|\[\]|\{\}|\(\)|${QUOTED}|${CONSTANT}`;
const JVM_VALUE = String.raw`null|true|false|${NUMBER}|${QUOTED}|${CONSTANT}|${EMPTY_CALL}`;
const NOOP: Readonly<Record<'python' | 'jvm', RegExp>> = {
  python: new RegExp(
    String.raw`^(?:pass|\.\.\.|continue|break|return(?:\s+(?:${PYTHON_VALUE}))?)$`,
    'u',
  ),
  jvm: new RegExp(
    String.raw`^(?:continue|break|Unit|(?:return(?:@\w+)?)(?:\s+(?:${JVM_VALUE}))?|${JVM_VALUE})$`,
    'u',
  ),
};
const RETHROWS = /\b(?:throw|raise)\b/u;

export function onlyDiscards(statements: readonly string[], language: Language): boolean {
  const noop = NOOP[language === 'python' ? 'python' : 'jvm'];
  return statements.length === 0 || statements.every((statement) => noop.test(statement));
}

export function statementsOf(body: string): string[] {
  return body
    .split(/[;\n]/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

export type HandlerFinding = { kind: string; key: string; detail: string };

export function handlerFinding({
  language,
  statements,
  body,
  broadTypes,
  shown,
}: {
  language: Language;
  statements: readonly string[];
  body: string;
  broadTypes: readonly string[];
  shown: string;
}): HandlerFinding | undefined {
  if (onlyDiscards(statements, language)) {
    return {
      kind: 'ignored-error',
      key: `swallow|${shown}`,
      detail: `${shown} swallows the error`,
    };
  }
  if (broadTypes.length === 0 || RETHROWS.test(body)) return undefined;
  return {
    kind: 'broad-catch',
    key: `broad|${broadTypes.join('|')}`,
    detail: `${shown} hides which failure happened`,
  };
}
