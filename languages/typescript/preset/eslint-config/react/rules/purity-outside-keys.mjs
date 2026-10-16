import { inKeyAttribute } from '../../../eslint-plugin/rules/react/jsx.mjs';
import { withReportFilter } from '../../rule-hints.mjs';

export function outsideKeyAttributes(rule) {
  return withReportFilter(
    rule,
    () => (descriptor) =>
      descriptor.node !== undefined && inKeyAttribute(descriptor.node) ? undefined : descriptor,
  );
}
