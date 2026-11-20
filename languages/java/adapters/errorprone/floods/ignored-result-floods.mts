import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';

type Finding = Readonly<Record<string, unknown>>;

export const IGNORED_RESULT_FLOOD = 20;
const RULE = 'CheckReturnValue';
const IGNORED_CALL = /^The result of `((?:[\w$]+\.)*[A-Za-z_$][\w$]*\([^`]*\))` must be used/u;

function ignoredCall(finding: Finding, isTest: (file: string) => boolean): string | undefined {
  if (finding['rule'] !== RULE || !isTest(textOf(finding['path']))) {
    return undefined;
  }
  return IGNORED_CALL.exec(textOf(finding['message']))?.[1];
}

function lineOf(finding: Finding): number {
  const line = fieldOf(finding['location'], 'line');
  return typeof line === 'number' ? line : 0;
}

function before(left: Finding, right: Finding): boolean {
  const paths = textOf(left['path']).localeCompare(textOf(right['path']), 'en');
  return paths < 0 || (paths === 0 && lineOf(left) < lineOf(right));
}

function summary(call: string, others: number): Pick<Finding, 'message' | 'allowedForm'> {
  const allowedForm =
    'Annotate the method with @CanIgnoreReturnValue (com.google.errorprone.annotations) when the call ' +
    'itself is the checked action, or use the results.';
  return {
    message:
      `The tests ignore the result of \`${call}\` here and at ${String(others)} other call sites, so the ` +
      `call is made for its effect (it records, sends or builds). ${allowedForm}`,
    allowedForm,
  };
}

export function withGroupedTestCalls(
  findings: readonly Finding[],
  isTest: (file: string) => boolean,
): Finding[] {
  const calls = findings.map((finding) => ignoredCall(finding, isTest));
  const first = new Map<string, Finding>();
  const counts = new Map<string, number>();
  for (const [index, call] of calls.entries()) {
    const finding = findings[index];
    if (call !== undefined && finding !== undefined) {
      const kept = first.get(call);
      first.set(call, kept === undefined || before(finding, kept) ? finding : kept);
      counts.set(call, (counts.get(call) ?? 0) + 1);
    }
  }
  return findings.flatMap((finding, index) => {
    const call = calls[index];
    const count = call === undefined ? 0 : (counts.get(call) ?? 0);
    if (call === undefined || count < IGNORED_RESULT_FLOOD) {
      return [finding];
    }
    return first.get(call) === finding ? [{ ...finding, ...summary(call, count - 1) }] : [];
  });
}
