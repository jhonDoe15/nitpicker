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
const MODULE_PATH = '--module-path';
const CHECK_LEVEL = /^-Xep:(\w+)(?::\w+)?$/u;
const ENCODING = '-encoding';
const UTF_8 = /^utf-?8$/iu;

export function testOnly(head: readonly string[]): boolean {
  return head.includes(TEST_ONLY);
}

function configuredChecks(flags: readonly string[]): ReadonlySet<string> | undefined {
  const checks = flags.flatMap((flag) => CHECK_LEVEL.exec(flag)?.slice(1, 2) ?? []);
  return checks.length === flags.length ? new Set(checks) : undefined;
}

function readsAsUtf8(head: readonly string[]): boolean {
  const at = head.indexOf(ENCODING);
  return at === -1 || UTF_8.test(head[at + 1] ?? '');
}

/** Why the source set stays whole on Error Prone and the engine runs none of its checks there, if it does. */
export function wholeReason(head: readonly string[]): string | undefined {
  if (configuredChecks(projectFlags(head)) === undefined) {
    return 'the project sets Error Prone options';
  }
  if (runsProcessors(head)) {
    return 'it runs annotation processors';
  }
  return readsAsUtf8(head) ? undefined : 'its sources are not read as UTF-8';
}

export function engineChecksFor(head: readonly string[]): EngineChecks {
  const configured = configuredChecks(projectFlags(head));
  if (configured === undefined || wholeReason(head) !== undefined) {
    return NONE;
  }
  const elsewhere = testOnly(head) || head.includes(MODULE_PATH);
  const packages = elsewhere ? [] : ownPackages(ownClasses(head));
  const checks = ENGINE_CHECKS.filter(
    (check) => !configured.has(check) && (check !== NULL_AWAY || packages.length > 0),
  );
  return { checks, packages: checks.includes(NULL_AWAY) ? packages : [] };
}
