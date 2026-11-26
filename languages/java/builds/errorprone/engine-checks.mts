import PORTED_CHECKS from '../../gradle/errorprone/engine-checks.json' with { type: 'json' };
import { ownClasses, ownPackages, projectFlags, runsProcessors } from './engine-arguments.mts';

export const NULL_AWAY = 'NullAway';
export const ENGINE_CHECKS: readonly string[] = [...PORTED_CHECKS, NULL_AWAY];

export type EngineChecks = {
  readonly checks: readonly string[];
  readonly packages: readonly string[];
};

const NONE: EngineChecks = { checks: [], packages: [] };
const TEST_ONLY = '--test-only';
export const TEST_SENSITIVE: readonly string[] = [
  'CheckedExceptionNotThrown',
  'ConstantPatternCompile',
  'ExposedPrivateType',
  'FutureReturnValueIgnored',
  'InterruptedExceptionSwallowed',
  'Interruption',
  'NarrowCalculation',
  'ProtoBuilderReturnValueIgnored',
  'ReturnValueIgnored',
  'StaticAssignmentOfThrowable',
  'ThrowSpecificExceptions',
  'UseCorrectAssertInTests',
];
const MODULE_PATH = '--module-path';
const CHECK_LEVEL = /^-Xep:(\w+)(?::(\w+))?$/u;
const OFF = 'OFF';
const ENCODING = '-encoding';
const UTF_8 = /^utf-?8$/iu;

function switchedOff(flags: readonly string[]): readonly string[] | undefined {
  const off: string[] = [];
  for (const flag of flags) {
    const [, check, level] = CHECK_LEVEL.exec(flag) ?? [];
    if (check === undefined || (ENGINE_CHECKS.includes(check) && level !== OFF)) {
      return undefined;
    }
    if (level === OFF) {
      off.push(check);
    }
  }
  return off;
}

function readsAsUtf8(head: readonly string[]): boolean {
  const at = head.indexOf(ENCODING);
  return at === -1 || UTF_8.test(head[at + 1] ?? '');
}

export function engineChecksFor(head: readonly string[]): EngineChecks {
  const off = switchedOff(projectFlags(head));
  if (off === undefined || runsProcessors(head) || !readsAsUtf8(head)) {
    return NONE;
  }
  const elsewhere = head.includes(TEST_ONLY) || head.includes(MODULE_PATH);
  const packages = elsewhere ? [] : ownPackages(ownClasses(head));
  const testOnly = head.includes(TEST_ONLY);
  const checks = ENGINE_CHECKS.filter(
    (check) =>
      !off.includes(check) &&
      (check !== NULL_AWAY || packages.length > 0) &&
      !(testOnly && TEST_SENSITIVE.includes(check)),
  );
  return { checks, packages: checks.includes(NULL_AWAY) ? packages : [] };
}
