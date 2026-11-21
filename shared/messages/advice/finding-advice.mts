import { insertBeforeRoute, isExceptionEntry, routeFields } from '../exception-sentence.mts';
import { textOf } from '../../values/readers.mts';

type AdviceInput = {
  readonly message: string;
  readonly allowedForm?: unknown;
  readonly exception?: unknown;
  readonly exceptionList?: unknown;
};

type AdvisedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly allowedForm?: string | undefined;
  readonly ratchet?: Ratchet | undefined;
  readonly [field: string]: unknown;
};

type Ratchet = {
  readonly worseMessage?: string | undefined;
  readonly worseAllowedForm?: string | undefined;
  readonly growthAdvice?: string | undefined;
  readonly growthAllowedForm?: string | undefined;
};

const EXCEPTION_LISTS = ['exceptions', 'python.exceptions'];

const BASE_MARKER = '{base}';

const ADVICE_KEYS = new Set(['allowedForm', 'exception', 'exceptionList']);

export function sortedKeys(_key: string, value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).toSorted(([left], [right]) =>
          left < right ? -1 : Number(left > right),
        ),
      )
    : value;
}

function sameExceptionEntry(left: unknown, right: unknown): boolean {
  return JSON.stringify(left, sortedKeys) === JSON.stringify(right, sortedKeys);
}

export function adviceProblems({
  message,
  allowedForm,
  exception,
  exceptionList,
}: AdviceInput): string[] {
  const route = routeFields(message);
  return [
    ...(allowedForm === undefined || message.includes(textOf(allowedForm))
      ? []
      : [`allowedForm is not part of the message: ${textOf(allowedForm)}`]),
    ...(exception === undefined && exceptionList !== undefined
      ? ['exceptionList needs exception, the entry to add']
      : []),
    ...(exception !== undefined && !isExceptionEntry(exception)
      ? ['exception must have a rule, a non-empty paths array and a reason']
      : []),
    ...(exception !== undefined &&
    !(typeof exceptionList === 'string' && EXCEPTION_LISTS.includes(exceptionList))
      ? [
          `exception needs exceptionList: ${EXCEPTION_LISTS.map((list) => `"${list}"`).join(' or ')}`,
        ]
      : []),
    ...(exception !== undefined && route.exception === undefined
      ? ['exception is set, but the message prints no exception sentence']
      : []),
    ...(exception !== undefined &&
    route.exception !== undefined &&
    (!sameExceptionEntry(exception, route.exception) || exceptionList !== route.exceptionList)
      ? [
          `exception ${JSON.stringify(exception)} in "${String(exceptionList)}" differs from the entry the message prints`,
        ]
      : []),
  ];
}

export function withMessage(
  finding: AdvisedFinding,
  { message, allowedForm }: { message: string; allowedForm: string | undefined },
): AdvisedFinding {
  const rest = Object.fromEntries(Object.entries(finding).filter(([key]) => !ADVICE_KEYS.has(key)));
  return {
    ...rest,
    tool: finding.tool,
    rule: finding.rule,
    path: finding.path,
    identity: finding.identity,
    classification: finding.classification,
    message,
    ...(allowedForm === undefined ? {} : { allowedForm }),
    ...routeFields(message),
  };
}

export function withWorseMessage(finding: AdvisedFinding, baseValue: number): AdvisedFinding {
  const { worseMessage, worseAllowedForm } = finding.ratchet ?? {};
  if (worseMessage === undefined) {
    return finding;
  }
  const message = worseMessage.replaceAll(BASE_MARKER, String(baseValue));
  const kept = finding.allowedForm !== undefined && message.includes(finding.allowedForm);
  return withMessage(finding, {
    message,
    allowedForm:
      worseAllowedForm?.replaceAll(BASE_MARKER, String(baseValue)) ??
      (kept ? finding.allowedForm : undefined),
  });
}

export function withGrowthAdvice(finding: AdvisedFinding, baseValue: number): AdvisedFinding {
  const { growthAdvice, growthAllowedForm } = finding.ratchet ?? {};
  if (growthAdvice === undefined) {
    throw new TypeError('growthAdvice is missing');
  }
  return withMessage(finding, {
    message: insertBeforeRoute(
      finding.message,
      growthAdvice.replaceAll(BASE_MARKER, String(baseValue)),
    ),
    allowedForm:
      growthAllowedForm === undefined
        ? finding.allowedForm
        : [finding.allowedForm, growthAllowedForm].filter((part) => part !== undefined).join(' '),
  });
}
