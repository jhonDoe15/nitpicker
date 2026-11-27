import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { mainSourceTypes } from '../type-declarations/declarations.mts';
import { indexOf } from '../type-declarations/type-index.mts';
import { hidingsIn } from './hidings.mts';
import { inheritedFields } from './inherited-fields.mts';
import { lineAt } from './own-regions.mts';
import type { HidingKind } from './hidings.mts';
import type { ParsedTypes } from '../type-declarations/declarations.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';

export const HIDDEN_INHERITED_FIELD_RULE = 'HiddenInheritedField';
export const HIDDEN_INHERITED_FIELD_EXCEPTION_RULE = `pmd/${HIDDEN_INHERITED_FIELD_RULE}`;

function hideMessage(kind: HidingKind, name: string, owner: string): string {
  return (
    `The ${kind} \`${name}\` has the name of the field \`${name}\` that this class inherits from ` +
    `\`${owner}\` and also uses, so the short name \`${name}\` means two things in one class. ` +
    `Rename the ${kind} after its own role. An exception fits only when the name is fixed from ` +
    'outside, such as a name a framework or a generated API requires.'
  );
}

export function hiddenInheritedFieldsIn(parsed: readonly ParsedTypes[]): ReviewFinding[] {
  const finding = findingFactory();
  const index = indexOf(parsed.flatMap(({ types }) => types));
  return parsed.flatMap(({ source, types }) =>
    types
      .filter(({ kind, superclass }) => kind === 'class' && superclass !== undefined)
      .flatMap((type) => {
        const inherited = inheritedFields(type, index);
        return inherited.size === 0
          ? []
          : hidingsIn(source, type, inherited).map((hiding) =>
              finding({
                rule: HIDDEN_INHERITED_FIELD_RULE,
                file: type.file,
                line: lineAt(source, hiding.index, type.line),
                symbol: hiding.name,
                key: `${type.file}:${type.name}:${hiding.scope}:${hiding.name}`,
                message: hideMessage(hiding.kind, hiding.name, hiding.inherited.owner.name),
              }),
            );
      }),
  );
}

export function readHiddenInheritedFieldFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  return hiddenInheritedFieldsIn(mainSourceTypes(projectRoot, options));
}

export const HIDDEN_INHERITED_FIELD_ALLOWED = hideMessage('variable', '<name>', '<Superclass>');
