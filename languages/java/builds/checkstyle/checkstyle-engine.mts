import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import {
  runEngineSync,
  type EngineEnvironment,
  type EngineHooks,
  type EngineStart,
} from '../../../../shared/engine/engine-run.mts';
import { fieldOf, listOf, messageOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import {
  nitpickerCheckstyleConfig,
  reportingCheckstyleConfig,
  withGuardChecks,
} from '../rulesets/checkstyle-config.mts';
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

export function checkstyleEnginePlanOf(plan: unknown): CheckstyleEnginePlan {
  const text = (key: string) => textOf(fieldOf(plan, key));
  return {
    config: text('config'),
    bundled: text('bundled'),
    guards: textsOf(fieldOf(plan, 'guards')),
    files: text('files'),
    engineReport: text('engineReport'),
    left: text('left'),
    version: text('version'),
  };
}

export function engineCoversConfig(config: string, bundled: string, guards: readonly string[]) {
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

function engineReads(file: string): boolean {
  if (path.basename(file) === 'module-info.java') {
    return false;
  }
  try {
    const text = UTF8.decode(readFileSync(file));
    return !text.startsWith(BYTE_ORDER_MARK) && !LONE_RETURN.test(text);
  } catch {
    return false;
  }
}

function engineFindings(plan: CheckstyleEnginePlan, config: string, call: EngineCall): string[] {
  const files = readFileSync(plan.files, 'utf8').split('\n').filter(Boolean);
  const unparsed = new Set(files.filter((file) => !engineReads(file)));
  const list = `${plan.engineReport}.files.txt`;
  const sent = files.filter((file) => !unparsed.has(file));
  writeFileSync(list, sent.join('\n'));
  const out = `${plan.engineReport}.json`;
  const { status, stderr } = call.run(['--rules', 'Checkstyle', '--files', list, '--out', out], {
    binary: call.binary,
    environment: call.environment,
  });
  if (status !== 0 || !existsSync(out)) {
    throw new Error(stderr.trim() || `exit status ${String(status)}`);
  }
  const report: unknown = JSON.parse(readFileSync(out, 'utf8'));
  rmSync(out, { force: true });
  rmSync(list, { force: true });
  const rows = listOf(fieldOf(report, 'findings')).map(rowOf);
  for (const file of [
    ...textsOf(fieldOf(report, 'syntaxErrorFiles')),
    ...rows.filter(({ rule }) => rule === UNPARSED).map(({ file }) => file),
  ]) {
    if (!sent.includes(file)) {
      throw new Error(`the engine named a file it was not given: ${file}`);
    }
    unparsed.add(file);
  }
  if (Number(fieldOf(report, 'files')) !== sent.length) {
    throw new Error('the engine did not read every file');
  }
  const modules = configModules(config);
  const kept = rows
    .filter(({ file, rule }) => !unparsed.has(file) && modules.has(moduleOf(rule)))
    .toSorted(byPosition);
  const handled = files.filter((file) => !unparsed.has(file));
  writeFileSync(plan.engineReport, checkstyleXml(plan.version, fileElements(handled, kept)));
  return files.filter((file) => unparsed.has(file));
}

function readable(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function checkstyleOnEngine(
  plan: CheckstyleEnginePlan,
  environment: EngineEnvironment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): string[] | undefined {
  rmSync(plan.engineReport, { force: true });
  rmSync(plan.left, { force: true });
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
    rmSync(plan.engineReport, { force: true });
    rmSync(plan.left, { force: true });
    log?.write(
      `nitpicker: the engine did not run the Checkstyle checks, Checkstyle does: ${messageOf(error)}\n`,
    );
    return undefined;
  }
}
