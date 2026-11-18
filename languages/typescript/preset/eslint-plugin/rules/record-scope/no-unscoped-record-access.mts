import type { TSESLint } from '@typescript-eslint/utils';
import { typeServices } from '../security/security-values.mts';
import { enclosingFunction, hasOwnershipCheck, isExemptContext } from './ownership-checks.mts';
import { fieldKey, isIdField } from './query-sites.mts';
import { conventionsOf, sitesOf } from './project-index.mts';
import { isFromRequest } from './request-values.mts';

export const rule: TSESLint.RuleModule<'unscoped', [], { readonly requiresTypeChecking: boolean }> =
  {
    meta: {
      type: 'problem',
      docs: {
        description:
          "Scope a record read or change by a request id with the owner field the project's other queries use",
        requiresTypeChecking: true,
      },
      schema: [],
      messages: {
        unscoped: [
          'This query on `{{model}}` takes `{{id}}` from the request but its filter has no `{{fields}}`, which {{share}}% of',
          "the project's queries on it carry, so a caller who knows or guesses an id reaches another owner's record.",
          "Add the field from the authenticated caller to the filter, or check the record's owner or the caller's access",
          'before using it. An exception fits admin and internal code that reads across owners on purpose.',
        ].join(' '),
      },
    },
    create(context) {
      const services = typeServices(context);
      if (services === undefined) {
        return {};
      }
      return {
        Program(program) {
          const { program: tsProgram, esTreeNodeToTSNodeMap } = services;
          const sourceFile = esTreeNodeToTSNodeMap.get(program);
          const scope = { checker: tsProgram.getTypeChecker(), sourceFile };
          for (const site of sitesOf(sourceFile)) {
            const fn = enclosingFunction(site.call);
            const request = site.entries.find(
              (entry) =>
                isIdField(entry.name) &&
                entry.value !== undefined &&
                isFromRequest(entry.value, scope),
            );
            const present = new Set(site.entries.map((entry) => fieldKey(entry.name)));
            const missing = conventionsOf(tsProgram, site.model).filter(
              ({ name }) => !present.has(fieldKey(name)),
            );
            if (
              request === undefined ||
              missing.length === 0 ||
              fn === undefined ||
              hasOwnershipCheck(fn, site.call) ||
              isExemptContext(site.call, sourceFile)
            ) {
              continue;
            }
            const start = sourceFile.getLineAndCharacterOfPosition(site.call.getStart(sourceFile));
            const end = sourceFile.getLineAndCharacterOfPosition(site.call.getEnd());
            context.report({
              loc: {
                start: { line: start.line + 1, column: start.character },
                end: { line: end.line + 1, column: end.character },
              },
              messageId: 'unscoped',
              data: {
                model: site.label,
                id: request.name,
                fields: missing.map(({ name }) => name).join('`, `'),
                share: String(Math.min(...missing.map(({ share }) => share))),
              },
            });
          }
        },
      };
    },
  };
