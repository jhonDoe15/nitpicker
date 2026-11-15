import { describeRuleFinding, exceptionRoute } from '../typed/rule-hint-views.mts';

export type SampleSpec = {
  readonly tool: string;
  readonly rule: string;
  readonly data?: object | undefined;
  readonly subject?: string | undefined;
};
export type Sample = {
  tool: string;
  rule: string;
  subject: string | undefined;
  path: string;
  identity: string;
  message: string;
  classification: string;
};

export function route(rule: string): string {
  return exceptionRoute({
    rule,
    path: 'src/a.py',
    key: 'python.exceptions',
    function: undefined,
    name: undefined,
  });
}

export function sample({ tool, rule, data, subject }: SampleSpec): Sample {
  return {
    tool,
    rule,
    subject,
    path: 'src/a.py',
    identity: 'x',
    message:
      data === undefined ? 'The base message.' : describeRuleFinding(rule, 'total.rate', { data }),
    classification: 'enforceable',
  };
}
