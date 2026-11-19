import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { BlockingProject } from '../typed/kotlin-flow-types.mts';
import type { FindingFactory, ReviewFinding } from '../typed/review-finding-types.mts';
import { classifyBlocking } from './classify.mts';
import { projectIndex } from './project-index.mts';
import { SOURCE_TOOL } from '../review-finding.mts';
import { TIMEOUT_RULE, callKey, scopeName, timeoutFindings } from './timeouts.mts';
import { resolverFor } from './type-names.mts';

export const BLOCKING_RULE = 'BlockingCallInCoroutine';
export const BLOCKING_RULES = [BLOCKING_RULE, TIMEOUT_RULE];

export function blockingMessage(subject: string, basis: string, scope: string): string {
  return `\`${subject}\` blocks the thread inside the coroutine code of \`${scope}\` (${basis}), so the other coroutines on that thread wait and cancellation cannot interrupt it. Run it in \`withContext(ioDispatcher) { ... }\` (\`runInterruptible(ioDispatcher) { ... }\` for an interruptible wait such as \`Future.get()\`) with an injected \`CoroutineDispatcher\`, or call a suspending API instead.`;
}

function blockingCallFindings(
  files: KotlinFile[],
  {
    finding,
    project,
    covered,
  }: { finding: FindingFactory; project: BlockingProject; covered: Set<string> },
): ReviewFinding[] {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const resolver = resolverFor(file, project.declared);
      return (file.coroutines?.calls ?? []).flatMap((call) => {
        const blocking = classifyBlocking(call, resolver, project);
        if (blocking === undefined || covered.has(callKey(file, call))) {
          return [];
        }
        const scope = scopeName(file, call);
        return [
          finding({
            tool: SOURCE_TOOL,
            rule: BLOCKING_RULE,
            file: file.file,
            line: call.line,
            symbol: `${scope}.${blocking.subject}`,
            message: blockingMessage(blocking.subject, blocking.basis, scope),
          }),
        ];
      });
    });
}

export function blockingFindings(
  files: KotlinFile[],
  {
    finding,
    declaredIn = files,
    projectRoot,
    javaRoots,
  }: {
    finding: FindingFactory;
    declaredIn?: KotlinFile[];
    projectRoot: string;
    javaRoots?: string[] | undefined;
  },
): ReviewFinding[] {
  const project = projectIndex(declaredIn, { projectRoot, javaRoots });
  const timeouts = timeoutFindings(files, { finding, project });
  return [
    ...blockingCallFindings(files, { finding, project, covered: timeouts.reported }),
    ...timeouts.findings,
  ];
}
