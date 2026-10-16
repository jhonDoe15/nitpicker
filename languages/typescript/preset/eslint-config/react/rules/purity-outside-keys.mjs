import { ancestorsOf } from '../../../eslint-plugin/rules/analysis/ancestry.mjs';
import { attributeNamed } from '../../../eslint-plugin/rules/react/jsx.mjs';
import { withReportFilter } from '../../rule-hints.mjs';

function isInKeyAttribute(node) {
  const owner = ancestorsOf(node).find(({ type }) => type === 'JSXAttribute');
  return owner !== undefined && attributeNamed(owner.parent, 'key') === owner;
}

export function outsideKeyAttributes(rule) {
  return withReportFilter(
    rule,
    () => (descriptor) =>
      descriptor.node !== undefined && isInKeyAttribute(descriptor.node) ? undefined : descriptor,
  );
}
