import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import {
  runEngineSync,
  type EngineEnvironment,
  type EngineHooks,
  type EngineStart,
} from '../../../../shared/engine/engine-run.mts';
import { isFile } from '../../../../shared/filesystem.mts';
import {
  fieldOf,
  listOf,
  messageOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../shared/values/readers.mts';
import {
  nitpickerCheckstyleConfig,
  reportingCheckstyleConfig,
  withGuardChecks,
} from './checkstyle-config.mts';
import { checkstyleXml, fileElements, type CheckstyleRow } from './checkstyle-xml.mts';

export type CheckstyleEnginePlan = {
  readonly config: string;
  readonly bundled: string;
  readonly guards: readonly string[];
  readonly files: string;
  readonly engineReport: string;
  readonly left: string;
  readonly version: string;
};

const UNPARSED = 'CheckstyleUnparsed';
const CONFIG_MODULE = /<module name="([A-Za-z]+)"/gu;

function planText(plan: unknown, key: string): string {
  return textOf(fieldOf(plan, key));
}

export function checkstyleEnginePlanOf(plan: unknown): CheckstyleEnginePlan {
  return {
    config: planText(plan, 'config'),
    bundled: planText(plan, 'bundled'),
    guards: textsOf(fieldOf(plan, 'guards')),
    files: planText(plan, 'files'),
    engineReport: planText(plan, 'engineReport'),
    left: planText(plan, 'left'),
    version: planText(plan, 'version'),
  };
}

export function engineCoversConfig(
  config: string,
  bundled: string,
  guards: readonly string[],
): boolean {
  const covered = withGuardChecks(
    reportingCheckstyleConfig(nitpickerCheckstyleConfig(bundled), 'formatted'),
    guards,
  );
  return config === covered;
}

function moduleOf(source: string): string {
  const name = source.slice(source.lastIndexOf('.') + 1).split('#')[0] ?? '';
  return name.endsWith('Check') ? name.slice(0, -'Check'.length) : name;
}

function configModules(config: string): Set<string> {
  return new Set([...config.matchAll(CONFIG_MODULE)].map(([, name]) => name ?? ''));
}

function rowOf(finding: unknown): CheckstyleRow & { readonly rule: string } {
  const rule = textOf(fieldOf(finding, 'rule'));
  return {
    file: textOf(fieldOf(finding, 'file')),
    rule,
    source: rule,
    line: Number(fieldOf(finding, 'line')),
    column: Number(fieldOf(finding, 'column') ?? 0),
    message: textOf(fieldOf(finding, 'message')),
  };
}

function byPosition(left: CheckstyleRow, right: CheckstyleRow): number {
  return left.line - right.line || left.column - right.column;
}

type EngineCall = {
  readonly binary: string;
  readonly environment: EngineEnvironment;
  readonly run: EngineStart;
};

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const BYTE_ORDER_MARK = '\uFEFF';
const LONE_RETURN = /\r(?!\n)/u;
const LINE_BREAK = /\r\n|\r|\n/u;

function decodedText(file: string): { readonly text: string } | { readonly unreadable: true } {
  try {
    return { text: UTF8.decode(readFileSync(file)) };
  } catch {
    return { unreadable: true };
  }
}

function engineReads(file: string): boolean {
  if (path.basename(file) === 'module-info.java') {
    return false;
  }
  const decoded = decodedText(file);
  return (
    'text' in decoded &&
    !(decoded.text.startsWith(BYTE_ORDER_MARK) || LONE_RETURN.test(decoded.text))
  );
}

function engineReport(list: string, out: string, call: EngineCall): unknown {
  const { status, stderr } = call.run(['--rules', 'Checkstyle', '--files', list, '--out', out], {
    binary: call.binary,
    environment: call.environment,
  });
  if (status !== 0 || !existsSync(out)) {
    throw new Error(stderr.trim() || `exit status ${String(status)}`);
  }
  const report = parseJson(readFileSync(out, 'utf8'));
  rmSync(out, { force: true });
  rmSync(list, { force: true });
  return report;
}

function engineUnparsed(
  report: unknown,
  rows: readonly CheckstyleRow[],
  sent: ReadonlySet<string>,
): string[] {
  const named = [
    ...textsOf(fieldOf(report, 'syntaxErrorFiles')),
    ...rows.filter(({ source }) => source === UNPARSED).map(({ file }) => file),
  ];
  for (const file of named) {
    if (!sent.has(file)) {
      throw new Error(`the engine named a file it was not given: ${file}`);
    }
  }
  return named;
}

function writeEngineReport(
  plan: CheckstyleEnginePlan,
  config: string,
  {
    handled,
    rows,
  }: { readonly handled: readonly string[]; readonly rows: readonly CheckstyleRow[] },
): void {
  const modules = configModules(config);
  const handledFiles = new Set(handled);
  const kept = rows
    .filter(({ file, source }) => handledFiles.has(file) && modules.has(moduleOf(source)))
    .toSorted(byPosition);
  writeFileSync(plan.engineReport, checkstyleXml(plan.version, fileElements(handled, kept)));
}

function engineFindings(plan: CheckstyleEnginePlan, config: string, call: EngineCall): string[] {
  const files = readFileSync(plan.files, 'utf8').split(LINE_BREAK).filter(Boolean);
  const unparsed = new Set(files.filter((file) => !engineReads(file)));
  const sent = files.filter((file) => !unparsed.has(file));
  const list = `${plan.engineReport}.files.txt`;
  writeFileSync(list, sent.join('\n'));
  const report = engineReport(list, `${plan.engineReport}.json`, call);
  const rows = listOf(fieldOf(report, 'findings')).map(rowOf);
  for (const file of engineUnparsed(report, rows, new Set(sent))) {
    unparsed.add(file);
  }
  if (Number(fieldOf(report, 'files')) !== sent.length) {
    throw new Error('the engine did not read every file');
  }
  writeEngineReport(plan, config, { handled: files.filter((file) => !unparsed.has(file)), rows });
  return files.filter((file) => unparsed.has(file));
}

function readable(file: string): string | undefined {
  return isFile(file) ? readFileSync(file, 'utf8') : undefined;
}

function removeOutputs(plan: CheckstyleEnginePlan): void {
  rmSync(plan.engineReport, { force: true });
  rmSync(plan.left, { force: true });
}

export function checkstyleOnEngine(
  plan: CheckstyleEnginePlan,
  environment: EngineEnvironment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): string[] | undefined {
  removeOutputs(plan);
  const binary = findEngine(environment);
  const config = readable(plan.config);
  const bundled = readable(plan.bundled);
  if (binary === undefined || config === undefined || bundled === undefined) {
    return undefined;
  }
  try {
    if (!engineCoversConfig(config, bundled, plan.guards)) {
      return undefined;
    }
    const left = engineFindings(plan, config, { binary, environment, run });
    writeFileSync(plan.left, left.join('\n'));
    return left;
  } catch (error) {
    removeOutputs(plan);
    log?.write(
      `nitpicker: the engine did not run the Checkstyle checks, Checkstyle does: ${messageOf(error)}\n`,
    );
    return undefined;
  }
}
