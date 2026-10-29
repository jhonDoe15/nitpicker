import { NON_SUSPENDING_STANDARD } from './blocking-catalog.mjs';
import { classifyBlocking } from './classify.mjs';
import { resolverFor } from './type-names.mjs';

export const TIMEOUT_RULE = 'TimeoutWithoutSuspension';

const COOPERATIVE_REFERENCES = new Set(['isActive', 'coroutineContext']);
const COROUTINES_PACKAGE = 'kotlinx.coroutines.';

export function timeoutMessage(builder, work) {
  return `\`${builder}\` can only cancel its block at a suspension point, and this block has none: it runs \`${work}\` and no call that suspends, so the timeout never fires while the work runs and the caller waits for all of it. Move the blocking work into \`withContext(Dispatchers.IO) { ... }\` or \`runInterruptible(Dispatchers.IO) { ... }\` inside the block, or call \`ensureActive()\` or \`yield()\` in the loop that does the work.`;
}

function plainProjectCall(call, project) {
  return (
    call.qualifier === undefined &&
    project.plain.has(call.name) &&
    !project.suspending.has(call.name)
  );
}

function workOf(call, resolver, project) {
  if (classifyBlocking(call, resolver, project) !== undefined) {
    return call.qualifier === undefined ? call.name : `${call.qualifier}.${call.name}`;
  }
  return plainProjectCall(call, project) ? call.name : undefined;
}

function isKnownPlain(call, resolver, project) {
  return (
    workOf(call, resolver, project) !== undefined ||
    NON_SUSPENDING_STANDARD.has(call.name) ||
    (call.qualifier === undefined && project.constructors.has(call.name))
  );
}

function timeoutWork(timeout, resolver, project) {
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

export function timeoutFindings(files, { finding, project }) {
  const reported = new Set();
  const findings = [];
  for (const file of files.filter(({ test }) => !test)) {
    const resolver = resolverFor(file);
    if (!resolver.importsFrom(COROUTINES_PACKAGE)) {
      continue;
    }
    for (const timeout of file.coroutines?.timeouts ?? []) {
      const work = timeoutWork(timeout, resolver, project);
      if (work === undefined) {
        continue;
      }
      for (const call of timeout.calls) {
        reported.add(`${file.file}:${String(call.line)}:${call.name}`);
      }
      findings.push(
        finding({
          rule: TIMEOUT_RULE,
          file: file.file,
          line: timeout.line,
          symbol: `${timeout.function ?? file.file}.${timeout.builder}`,
          key: `${timeout.function}:${timeout.builder}:${work}`,
          message: timeoutMessage(timeout.builder, work),
        }),
      );
    }
  }
  return { findings, reported };
}
