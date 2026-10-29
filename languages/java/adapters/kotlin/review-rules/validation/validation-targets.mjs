export const VALIDATION_TARGET_RULE = 'ValidationAnnotationTarget';

const CONSTRAINT_PACKAGES = new Set([
  'jakarta.validation.constraints',
  'javax.validation.constraints',
  'org.hibernate.validator.constraints',
]);
const CASCADES = new Set(['jakarta.validation.Valid', 'javax.validation.Valid']);
const VISIBLE_TARGETS = new Set(['field', 'get', 'all']);
const QUALIFIED = /^[a-z_]\w*(?:\.\w+)+$/u;

function messageFor(name) {
  return `Write @field:${name} on this constructor property. Without a use-site target Kotlin puts the annotation on the constructor parameter, where Bean Validation does not look, so @Valid checks nothing.`;
}

function importResolver(file) {
  const explicit = new Map(
    file.imports
      .filter(({ all }) => !all)
      .map(({ path, alias }) => [alias ?? path.split('.').at(-1), path]),
  );
  const stars = file.imports.filter(({ all }) => all).map(({ path }) => path);
  return (name) => {
    const [first, ...rest] = name.split('.');
    if (explicit.has(first)) {
      return [[explicit.get(first), ...rest].join('.')];
    }
    return QUALIFIED.test(name) ? [name] : stars.map((prefix) => `${prefix}.${name}`);
  };
}

function isValidation(qualified) {
  return (
    CASCADES.has(qualified) || CONSTRAINT_PACKAGES.has(qualified.split('.').slice(0, -1).join('.'))
  );
}

function hiddenAnnotation(resolve, parameter) {
  return (parameter.annotationEntries ?? []).find(
    (entry) =>
      !VISIBLE_TARGETS.has(entry.target) &&
      resolve((entry.type ?? entry.name).replace(/^@/u, '')).some(isValidation),
  );
}

export function validationTargetFindings(files, { finding }) {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const resolve = importResolver(file);
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
