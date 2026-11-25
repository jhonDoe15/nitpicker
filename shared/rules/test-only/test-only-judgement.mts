import { MESSAGES, messageFields } from '../../policy.mts';
import { UNUSED_API_RULE_IDS } from '../../unused-api/unused-api-policy.mts';
import { exceptionText } from '../exceptions.mts';
import type { Finding } from '../../values/findings.mts';
import { fieldOf } from '../../values/readers.mts';

export type TestOnlyItem = {
  readonly file: string;
  readonly category: string;
  readonly entry: { readonly name: string; readonly line?: number | undefined };
  readonly reexportedBy?: string | undefined;
};

type Judging = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
  readonly isPublished: (file: string) => boolean;
  readonly messages: unknown;
};

const TEST_SUPPORT = /(?:^|\/)test-support\//u;
const FILES = 'files';
const RULE = UNUSED_API_RULE_IDS.testOnlyExport;

export const TYPESCRIPT_TEST_ONLY_MESSAGES = {
  [FILES]: MESSAGES.testOnlyModule,
  exports: MESSAGES.testOnlyExport,
  reexport: MESSAGES.testOnlyReexport,
};

export const NEUTRAL_TEST_ONLY_MESSAGES = {
  [FILES]: MESSAGES.testOnlyFile,
  exports: MESSAGES.testOnlyDeclaration,
  reexport: MESSAGES.testOnlyDeclaration,
};

function isJudgedTestOnly(item: TestOnlyItem, { isPublished, isExcepted }: Judging): boolean {
  return !(
    (item.category === FILES && TEST_SUPPORT.test(item.file)) ||
    isPublished(item.file) ||
    isExcepted(RULE, item.file)
  );
}

function templateFor({ category, reexportedBy }: TestOnlyItem, messages: unknown): unknown {
  if (category === FILES) {
    return fieldOf(messages, FILES);
  }
  return fieldOf(messages, reexportedBy === undefined ? 'exports' : 'reexport');
}

function testOnlyFinding(item: TestOnlyItem, { analyzerName, messages }: Judging): Finding {
  const { file, category, entry, reexportedBy } = item;
  return {
    tool: analyzerName,
    rule: RULE,
    path: file,
    identity: `${category}:${entry.name}`,
    ...messageFields(templateFor(item, messages), {
      name: entry.name,
      reexporter: reexportedBy,
      exception: exceptionText(RULE, file),
    }),
    classification: 'enforceable',
    symbol: entry.name,
    ...(typeof entry.line === 'number' && Number.isInteger(entry.line)
      ? { location: { line: entry.line } }
      : {}),
  };
}

export function testOnlyFindings(items: readonly TestOnlyItem[], context: Judging): Finding[] {
  return items
    .filter((item) => isJudgedTestOnly(item, context))
    .map((item) => testOnlyFinding(item, context));
}
