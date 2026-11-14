import { describeRuleFinding } from '../rule-hints.mjs';
import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';

export function route(rule) {
  return exceptionRoute({ rule, path: 'src/a.py', key: 'python.exceptions' });
}

export function sample({ tool, rule, data, subject }) {
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
