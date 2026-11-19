import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type {
  BlockingProject,
  BlockingResolver,
  CoroutineCall,
  CoroutineTimeout,
} from '../typed/kotlin-flow-types.mts';
import type { FindingFactory, ReviewFinding } from '../typed/review-finding-types.mts';
import { SOURCE_TOOL } from '../review-finding.mts';
import { NON_SUSPENDING_STANDARD } from './blocking-catalog.mts';
import { classifyBlocking } from './classify.mts';
import { resolverFor } from './type-names.mts';

export const TIMEOUT_RULE = 'TimeoutWithoutSuspension';

const COOPERATIVE_REFERENCES = new Set(['isActive', 'coroutineContext']);
const COROUTINES_PACKAGE = 'kotlinx.coroutines.';

export function timeoutMessage(builder: string, work: string): string {
  return `\`${builder}\` can cancel its block only at a suspension point, and this block has none: \`${work}\` runs to the end before the timeout can fire. Run the work in \`withContext(ioDispatcher) { ... }\` or \`runInterruptible(ioDispatcher) { ... }\` inside the block, with an injected \`CoroutineDispatcher\`, or call \`ensureActive()\` in the loop that does it.`;
}

export function scopeName(file: KotlinFile, entry: { owner?: string; function?: string }): string {
  return (
    [entry.owner, entry.function].filter((part) => part !== undefined && part !== '').join('.') ||
    file.file
  );
}

function plainProjectCall(call: CoroutineCall, project: BlockingProject): boolean {
  return (
    call.qualifier === undefined &&
    project.plain.has(call.name) &&
    !project.suspending.has(call.name)
  );
}

function workOf(
  call: CoroutineCall,
  resolver: BlockingResolver,
  project: BlockingProject,
): string | undefined {
  if (classifyBlocking(call, resolver, project) !== undefined) {
    return call.qualifier === undefined ? call.name : `${call.qualifier}.${call.name}`;
  }
  return plainProjectCall(call, project) ? call.name : undefined;
}

function isKnownPlain(
  call: CoroutineCall,
  resolver: BlockingResolver,
  project: BlockingProject,
): boolean {
  return (
    workOf(call, resolver, project) !== undefined ||
    NON_SUSPENDING_STANDARD.includes(call.name) ||
    (call.qualifier === undefined && project.constructors.has(call.name))
  );
}

function timeoutWork(
  timeout: CoroutineTimeout,
  resolver: BlockingResolver,
  project: BlockingProject,
): string | undefined {
  const calls = timeout.calls;
  const cooperative = timeout.references.some((name) => COOPERATIVE_REFERENCES.has(name));
  if (
    cooperative ||
    timeout.opaqueLoops > 0 ||
    !calls.every((call) => isKnownPlain(call, resolver, project))
  ) {
    return undefined;
  }
  return calls.map((call) => workOf(call, resolver, project)).find((name) => name !== undefined);
}

export function callKey(file: KotlinFile, call: CoroutineCall): string {
  return `${file.file}:${String(call.line)}:${call.name}`;
}

type TimeoutEntry = { keys: string[]; finding: ReviewFinding };

function fileTimeouts(
  file: KotlinFile,
  { finding, project }: { finding: FindingFactory; project: BlockingProject },
): TimeoutEntry[] {
  const resolver = resolverFor(file, project.declared);
  if (!resolver.importsFrom(COROUTINES_PACKAGE)) {
    return [];
  }
  return (file.coroutines?.timeouts ?? []).flatMap((timeout) => {
    const work = timeoutWork(timeout, resolver, project);
    if (work === undefined) {
      return [];
    }
    const scope = scopeName(file, timeout);
    return [
      {
        keys: timeout.calls.map((call) => callKey(file, call)),
        finding: finding({
          tool: SOURCE_TOOL,
          rule: TIMEOUT_RULE,
          file: file.file,
          line: timeout.line,
          symbol: `${scope}.${timeout.builder}`,
          key: `${scope}:${timeout.builder}:${work}`,
          message: timeoutMessage(timeout.builder, work),
        }),
      },
    ];
  });
}

export function timeoutFindings(
  files: KotlinFile[],
  { finding, project }: { finding: FindingFactory; project: BlockingProject },
): { findings: ReviewFinding[]; reported: Set<string> } {
  const entries = files
    .filter(({ test }) => !test)
    .flatMap((file) => fileTimeouts(file, { finding, project }));
  return {
    findings: entries.map((entry) => entry.finding),
    reported: new Set(entries.flatMap((entry) => entry.keys)),
  };
}
