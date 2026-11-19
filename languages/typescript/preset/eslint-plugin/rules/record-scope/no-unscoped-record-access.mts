import { smallest } from '../../../../../../shared/lists/lists.mts';
import {
  typedProgramRule,
  type ProgramFinding,
  type ProgramScope,
} from '../program-rules/typed-program-rule.mts';
import { enclosingFunction, hasOwnershipCheck, isExemptContext } from './ownership-checks.mts';
import { fieldKey, isIdField, type Site } from './query-sites.mts';
import { conventionsOf, sitesOf } from './project-index.mts';
import { isFromRequest } from './request-values.mts';

const MESSAGE = [
  'This query on `{{model}}` takes `{{id}}` from the request but its filter has no `{{fields}}`, which {{share}}% of',
  "the project's queries on it carry, so a caller who knows or guesses an id reaches another owner's record.",
  "Add the field from the authenticated caller to the filter, or check the record's owner or the caller's access",
  'before using it. An exception fits admin and internal code that reads across owners on purpose.',
].join(' ');

function findingOf(site: Site, scope: ProgramScope): ProgramFinding | undefined {
  const fn = enclosingFunction(site.call);
  const request = site.entries.find(
    (entry) =>
      isIdField(entry.name) && entry.value !== undefined && isFromRequest(entry.value, scope),
  );
  const present = new Set(site.entries.map((entry) => fieldKey(entry.name)));
  const missing = conventionsOf(scope.program, site.model).filter(
    ({ name }) => !present.has(fieldKey(name)),
  );
  if (
    request === undefined ||
    missing.length === 0 ||
    fn === undefined ||
    hasOwnershipCheck(fn, site.call) ||
    isExemptContext(site.call, scope.sourceFile)
  ) {
    return undefined;
  }
  return {
    node: site.call,
    data: {
      model: site.label,
      id: request.name,
      fields: missing.map(({ name }) => name).join('`, `'),
      share: String(smallest(missing.map(({ share }) => share))),
    },
  };
}

export const rule = typedProgramRule({
  description:
    "Scope a record read or change by a request id with the owner field the project's other queries use",
  messageId: 'unscoped',
  messages: { unscoped: MESSAGE },
  findings: (scope) =>
    sitesOf(scope.sourceFile)
      .map((site) => findingOf(site, scope))
      .filter((finding) => finding !== undefined),
});
