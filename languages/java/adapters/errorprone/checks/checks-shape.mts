export const CHECKS_FILE = 'languages/java/gradle/errorprone/checks.json';

type Fields = Readonly<Record<string, unknown>>;
export type ErrorProneChecks = {
  readonly reviewed: { readonly errorProne: string; readonly nullAway: string };
  readonly reviewedChecks: readonly string[];
  readonly enable: readonly string[];
  readonly disable: readonly string[];
  readonly defaultOff: readonly string[];
  readonly certainBugs: readonly string[];
  readonly lombokUnsuppressedOff: readonly string[];
  readonly suppressible: readonly string[];
  readonly classExemptions: Readonly<Record<string, readonly string[]>>;
};

function fieldsAt(fields: Fields, key: string): Fields {
  const value = fields[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${CHECKS_FILE} needs an object at ${key}`);
  }
  return Object.fromEntries(Object.entries(value));
}

function stringAt(fields: Fields, key: string): string {
  const value = fields[key];
  if (typeof value !== 'string') {
    throw new TypeError(`${CHECKS_FILE} needs a string at ${key}`);
  }
  return value;
}

function stringsAt(fields: Fields, key: string): readonly string[] {
  const value = fields[key];
  if (!(Array.isArray(value) && value.every((item) => typeof item === 'string'))) {
    throw new TypeError(`${CHECKS_FILE} needs a list of strings at ${key}`);
  }
  return value;
}

export function checksOf(value: unknown): ErrorProneChecks {
  const fields = fieldsAt({ checks: value }, 'checks');
  const reviewed = fieldsAt(fields, 'reviewed');
  const exemptions = fieldsAt(fields, 'classExemptions');
  return {
    reviewed: {
      errorProne: stringAt(reviewed, 'errorProne'),
      nullAway: stringAt(reviewed, 'nullAway'),
    },
    reviewedChecks: stringsAt(fields, 'reviewedChecks'),
    enable: stringsAt(fields, 'enable'),
    disable: stringsAt(fields, 'disable'),
    defaultOff: stringsAt(fields, 'defaultOff'),
    certainBugs: stringsAt(fields, 'certainBugs'),
    lombokUnsuppressedOff: stringsAt(fields, 'lombokUnsuppressedOff'),
    suppressible: stringsAt(fields, 'suppressible'),
    classExemptions: Object.fromEntries(
      Object.keys(exemptions).map((name) => [name, stringsAt(exemptions, name)]),
    ),
  };
}
