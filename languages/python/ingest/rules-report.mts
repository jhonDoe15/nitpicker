import { describeRuleFinding as untypedDescribe, RULES_TOOL } from '../rules/rule-hints.mjs';
import { identitySubject } from '../rules/hints/effects/identity.mts';
import { createIdentities } from './typed/type-check-views.mts';
import { withRegexDefects as untypedWithRegexDefects } from '../rules/regexes/regex-defects.mjs';
import { parseJson } from '../../../shared/values/readers.mts';
import type { IngestedFinding, RulesReportEntry } from './typed/ingest-types.mts';

const describeRuleFinding: (rule: string, subject: string, context: object) => string =
  untypedDescribe;
const withRegexDefects: (entries: unknown) => RulesReportEntry[] = untypedWithRegexDefects;

type ToolErrorInput = {
  readonly rule: string;
  readonly path: string;
  readonly subject: string;
  readonly error: string | undefined;
};

const CHECK_FAILED_RULE = 'rules-check-failed';
const SKIPPED_RULE = 'rules-skipped';
export const MINIMUM_PYTHON = '3.10';
const TOO_DEEP_RULE = 'rules-too-deep';
const TOO_DEEP_CHECKS: Readonly<Record<string, string>> = {
  file: 'some of the per-file checks',
  all: 'every check',
};

function toolError({ rule, path, subject, error }: ToolErrorInput): IngestedFinding {
  const message =
    rule === SKIPPED_RULE
      ? `The python-rules checks did not run: they need Python ${MINIMUM_PYTHON} or newer, and the project environment runs Python ${subject}. Point "python.environment" at a Python ${MINIMUM_PYTHON} or newer environment.`
      : `The python-rules check ${subject} failed on ${path} (${String(error)}), so that file has no ${subject} findings; the other checks and files ran. Report it as a nitpicker bug with the file.`;
  return {
    tool: RULES_TOOL,
    rule,
    path,
    identity: rule === SKIPPED_RULE ? rule : `${rule}:${subject}`,
    message,
    classification: 'tool-error',
  };
}

function tooDeepMessage(subject: string): string {
  const checks = TOO_DEEP_CHECKS[subject] ?? `the ${subject} checks`;
  return `python-rules skipped ${checks} here: an expression nests too deeply for Python's recursion limit. Split the expression to have it checked.`;
}

function described(
  { rule, subject, data }: { rule: string; subject: string; data: unknown },
  libraries: unknown,
): { message: string; classification: string; hintData?: unknown } {
  if (rule === TOO_DEEP_RULE) {
    return { message: tooDeepMessage(subject), classification: 'descriptive' };
  }
  return {
    message: describeRuleFinding(rule, subject, { libraries, data }),
    classification: 'enforceable',
    ...(data === undefined ? {} : { hintData: data }),
  };
}

export function ingestRulesReport(text: string, libraries?: unknown): IngestedFinding[] {
  const identify = createIdentities();
  return withRegexDefects(parseJson(text)).map(
    ({ rule, path, subject, line, data, error, via }) => {
      if (rule === CHECK_FAILED_RULE || rule === SKIPPED_RULE) {
        return toolError({ rule, path, subject, error });
      }
      const shown = via ?? subject;
      return {
        tool: RULES_TOOL,
        rule,
        path,
        identity: identify({ path, rule, subject: identitySubject(rule, subject) }),
        subject: shown,
        ...described({ rule, subject: shown, data }, libraries),
        location: { line },
      };
    },
  );
}
