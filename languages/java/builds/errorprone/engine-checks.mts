import PORTED_CHECKS from '../../gradle/errorprone/engine-checks.json' with { type: 'json' };
import {
  lombokTested,
  lombokVersions,
  ownClasses,
  ownPackages,
  projectFlags,
  runsProcessors,
  TESTED_LOMBOK,
} from './engine-arguments.mts';

export const NULL_AWAY = 'NullAway';
export const ENGINE_CHECKS: readonly string[] = [...PORTED_CHECKS, NULL_AWAY];

export type EngineChecks = {
  readonly checks: readonly string[];
  readonly packages: readonly string[];
};

const NONE: EngineChecks = { checks: [], packages: [] };
const TEST_ONLY = '--test-only';
const CHECK_LEVEL = /^-Xep:(\w+)(?::\w+)?$/u;

export function testOnly(head: readonly string[]): boolean {
  return head.includes(TEST_ONLY);
}

function configuredChecks(flags: readonly string[]): ReadonlySet<string> | undefined {
  const checks = flags.flatMap((flag) => CHECK_LEVEL.exec(flag)?.slice(1, 2) ?? []);
  return checks.length === flags.length ? new Set(checks) : undefined;
}

/** Why the source set stays whole on Error Prone and the engine runs none of its checks there, if it does. */
export function wholeReason(head: readonly string[]): string | undefined {
  if (configuredChecks(projectFlags(head)) === undefined) {
    return 'the project sets Error Prone options';
  }
  const untested = lombokVersions(head).find((version) => !lombokTested(version));
  if (untested !== undefined) {
    const { lowest, highest } = TESTED_LOMBOK;
    return `it runs Lombok ${untested}, outside the versions compared with Error Prone (${lowest} to ${highest})`;
  }
  return runsProcessors(head) ? 'it runs annotation processors' : undefined;
}

export function engineChecksFor(head: readonly string[]): EngineChecks {
  const configured = configuredChecks(projectFlags(head));
  if (configured === undefined || wholeReason(head) !== undefined) {
    return NONE;
  }
  const packages = testOnly(head) ? [] : ownPackages(ownClasses(head));
  const checks = ENGINE_CHECKS.filter(
    (check) => !configured.has(check) && (check !== NULL_AWAY || packages.length > 0),
  );
  return { checks, packages: checks.includes(NULL_AWAY) ? packages : [] };
}
