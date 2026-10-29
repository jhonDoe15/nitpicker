import { classifyBlocking } from './classify.mjs';
import { projectIndex } from './project-index.mjs';
import { TIMEOUT_RULE, timeoutFindings } from './timeouts.mjs';
import { resolverFor } from './type-names.mjs';

export const BLOCKING_RULE = 'BlockingCallInCoroutine';
export const BLOCKING_RULES = [BLOCKING_RULE, TIMEOUT_RULE];

export function blockingMessage(subject, basis, owner) {
  return `\`${subject}\` blocks the thread inside the coroutine code of \`${owner ?? 'this scope'}\` (${basis}), so every other coroutine on that thread waits until it returns and a cancellation cannot interrupt it. Run it as \`withContext(Dispatchers.IO) { ... }\`, or \`runInterruptible(Dispatchers.IO) { ... }\` for an interruptible call such as \`Future.get()\` or \`BlockingQueue.take()\`, or use a suspending client (\`Mono.awaitSingle()\` instead of \`block()\`). \`Thread.sleep\` is left to detekt \`SleepInsteadOfDelay\`.`;
}

function blockingCallFindings(files, { finding, project, covered }) {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const resolver = resolverFor(file);
      return (file.coroutines?.calls ?? []).flatMap((call) => {
        const blocking = classifyBlocking(call, resolver, project);
        if (
          blocking === undefined ||
          covered.has(`${file.file}:${String(call.line)}:${call.name}`)
        ) {
          return [];
        }
        return [
          finding({
            rule: BLOCKING_RULE,
            file: file.file,
            line: call.line,
            symbol: `${call.function ?? file.file}.${blocking.subject}`,
            message: blockingMessage(blocking.subject, blocking.basis, call.function),
          }),
        ];
      });
    });
}

export function blockingFindings(files, { finding, declaredIn = files }) {
  const project = projectIndex(declaredIn);
  const timeouts = timeoutFindings(files, { finding, project });
  return [
    ...blockingCallFindings(files, { finding, project, covered: timeouts.reported }),
    ...timeouts.findings,
  ];
}
