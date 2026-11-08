import { describeRuleFinding } from '../rule-hints.mjs';
import { exceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';

export const route = (rule) => exceptionRoute({ rule, path: 'src/a.py', key: 'python.exceptions' });

export function sample({ tool, rule, data }) {
  return {
    tool,
    rule,
    path: 'src/a.py',
    identity: 'x',
    message:
      data === undefined ? 'The base message.' : describeRuleFinding(rule, 'total.rate', { data }),
    classification: 'enforceable',
  };
}
