import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { collectFacts as untypedCollectFacts } from '../../facts/python-facts.mjs';
import { parseIni as untypedIni } from '../../configuration/pytest/ini-file.mjs';
import { readJunit as untypedJunit } from '../../test-runs/junit-results.mjs';
import { readConsoleReport as untypedConsoleReport } from '../../test-results/console-output.mjs';

export type ConsoleEntry = {
  readonly file: string;
  readonly test: string;
  readonly messages: readonly string[];
};

export type ConsoleReport = Readonly<Record<string, unknown>> & {
  readonly entries: readonly ConsoleEntry[];
};

function isConsoleEntry(value: unknown): value is ConsoleEntry {
  return (
    typeof fieldOf(value, 'file') === 'string' &&
    typeof fieldOf(value, 'test') === 'string' &&
    Array.isArray(fieldOf(value, 'messages'))
  );
}

export type JunitCase = {
  readonly id: string;
  readonly name: string;
  readonly outcome: string;
  readonly runtimeId: string;
};

function isJunitCase(value: unknown): value is JunitCase {
  return typeof fieldOf(value, 'id') === 'string' && typeof fieldOf(value, 'outcome') === 'string';
}

export function readJunit(reportRoot: string, name?: string): JunitCase[] {
  return listOf(Reflect.apply(untypedJunit, undefined, [reportRoot, name])).filter(isJunitCase);
}

export type FactsReport = {
  readonly modules: readonly {
    file: string;
    role: string;
    entry: boolean;
    module: string;
    qualifiedUses: unknown;
  }[];
  readonly definitions: readonly {
    file: string;
    name: string;
    kind: string;
    line: number;
    lines: number;
    exported: boolean;
    literal: boolean;
    usedLocally: boolean;
    key: string;
    text: string;
    tokens: readonly string[];
    entry: boolean;
  }[];
  readonly imports: readonly {
    from: string;
    to: string;
    names: unknown;
    reexport: boolean;
    role: string;
    line: number;
  }[];
  readonly packages: unknown;
  readonly docComments: unknown;
};

function isFactsReport(value: unknown): value is FactsReport {
  return Array.isArray(fieldOf(value, 'modules')) && Array.isArray(fieldOf(value, 'definitions'));
}

function entriesOf(value: unknown): Iterable<readonly [unknown, unknown]> {
  if (!(value instanceof Map)) {
    return [];
  }
  const entries: Iterable<readonly [unknown, unknown]> = value;
  return entries;
}

export function parseIni(text: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  const parsed: unknown = Reflect.apply(untypedIni, undefined, [text]);
  for (const [name, options] of entriesOf(parsed)) {
    sections.set(
      textOf(name),
      new Map(Array.from(entriesOf(options), ([key, value]) => [textOf(key), textOf(value)])),
    );
  }
  return sections;
}

export function collectFacts(context: unknown, run: unknown): FactsReport {
  const report: unknown = Reflect.apply(untypedCollectFacts, undefined, [context, run]);
  if (!isFactsReport(report)) {
    throw new Error('The facts report is malformed');
  }
  return report;
}

export function readConsoleReport(reportRoot: string): { readonly report: ConsoleReport } {
  const report = fieldOf(Reflect.apply(untypedConsoleReport, undefined, [reportRoot]), 'report');
  return {
    report: {
      ...fieldsOf(report),
      entries: listOf(fieldOf(report, 'entries')).filter(isConsoleEntry),
    },
  };
}
