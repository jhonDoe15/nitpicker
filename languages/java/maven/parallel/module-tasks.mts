import { archunitMatcher } from '../maven-tests.mts';
import { runCoverageTools } from '../quick/maven-test-phase.mts';
import { runGuards } from '../guards/maven-guards.mts';
import { runEffects } from '../effects/maven-effects.mts';
import { runSpringArch } from '../spring/maven-spring-arch.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';

type TaskOptions = Readonly<Record<string, unknown>>;

function runArchitecture(options: TaskOptions): void {
  const { module, reportDir, tools, classpaths, pinned, springArch, springRoles } = options;
  callUntyped(runSpringArch, {
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    archRules: springArch,
    springRoles,
    spawn: options['spawn'],
    timeoutMs: options['timeoutMs'],
    environment: options['environment'],
  });
}

export function runModuleChecks(options: TaskOptions): void {
  callUntyped(runGuards, options, options['project']);
  callUntyped(runEffects, { ...options, options: options['effectsOptions'] });
  runArchitecture({ ...options, module: options['coverageModule'] });
}

export function runModuleCoverage(options: TaskOptions): void {
  callUntyped(runCoverageTools, {
    ...options,
    isArchunit: callUntyped(archunitMatcher, options['archunitIncludes']),
  });
}
