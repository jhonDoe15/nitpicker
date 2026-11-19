import type { AnnotationEntry, KotlinFile, ParameterFact } from '../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../typed/review-finding-types.mts';
import { CONSTRAINT_NAMES } from './constraint-names.mts';

export const VALIDATION_TARGET_RULE = 'ValidationAnnotationTarget';

const CONSTRAINT_PACKAGES = new Set(Object.keys(CONSTRAINT_NAMES));
const CASCADE_PACKAGES = new Set(['jakarta.validation', 'javax.validation']);
const CONSTRAINTS = new Set(Object.values(CONSTRAINT_NAMES).flat());
const VISIBLE_TARGETS = new Set(['field', 'get', 'all']);
const QUALIFIED = /^[a-z_]\w*(?:\.\w+)+$/u;

function messageFor(name: string): string {
  return `Write @field:${name} on this constructor property. Without a use-site target Kotlin puts the annotation on the constructor parameter, where Bean Validation does not look, so @Valid checks nothing.`;
}

function packageOf(qualified: string): string {
  return qualified.split('.').slice(0, -1).join('.');
}

function isValidation(qualified: string): boolean {
  const name = qualified.split('.').at(-1);
  return (
    CONSTRAINT_PACKAGES.has(packageOf(qualified)) ||
    (CASCADE_PACKAGES.has(packageOf(qualified)) && name === 'Valid')
  );
}

function isStarredValidation(qualified: string): boolean {
  const name = qualified.split('.').at(-1);
  return (
    isValidation(qualified) && (name === 'Valid' || (name !== undefined && CONSTRAINTS.has(name)))
  );
}

function validationResolver(file: KotlinFile, declared: Set<string>): (text: string) => boolean {
  const explicit = new Map<string | undefined, string>(
    file.imports
      .filter(({ all }) => !all)
      .map(({ path, alias }) => [alias ?? path.split('.').at(-1), path]),
  );
  const stars = file.imports.filter(({ all }) => all).map(({ path }) => path);
  return (text) => {
    const name = text.replaceAll(/[@`\s]/gu, '');
    const [first, ...rest] = name.split('.');
    if (explicit.has(first)) {
      return isValidation([explicit.get(first), ...rest].join('.'));
    }
    if (QUALIFIED.test(name)) {
      return isValidation(name);
    }
    return (
      !declared.has([file.package, name].filter(Boolean).join('.')) &&
      stars.some((prefix) => isStarredValidation(`${prefix}.${name}`))
    );
  };
}

function visible(target: string | undefined): boolean {
  return target !== undefined && VISIBLE_TARGETS.has(target);
}

function hiddenAnnotation(
  isValidationName: (text: string) => boolean,
  parameter: ParameterFact,
): AnnotationEntry | undefined {
  const entries = (parameter.annotationEntries ?? []).filter((entry) =>
    isValidationName(entry.type ?? entry.name),
  );
  const visibleNames = new Set(
    entries.filter(({ target }) => visible(target)).map(({ name }) => name),
  );
  return entries.find(({ name, target }) => !(visible(target) || visibleNames.has(name)));
}

export function validationTargetFindings(
  files: KotlinFile[],
  { finding }: RuleOptions,
): ReviewFinding[] {
  const declared = new Set(
    files.flatMap((file) =>
      file.classes.map(({ qualified }) => [file.package, qualified].filter(Boolean).join('.')),
    ),
  );
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const resolve = validationResolver(file, declared);
      return file.classes.flatMap((klass) =>
        klass.primaryParameters
          .filter(({ property }) => property !== undefined)
          .flatMap((parameter) => {
            const hidden = hiddenAnnotation(resolve, parameter);
            return hidden === undefined
              ? []
              : [
                  finding({
                    rule: VALIDATION_TARGET_RULE,
                    file: file.file,
                    line: parameter.line,
                    symbol: `${klass.qualified}.${parameter.name}`,
                    message: messageFor(hidden.name),
                  }),
                ];
          }),
      );
    });
}
