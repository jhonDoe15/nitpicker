import type { Optional } from '../typed/optional.mts';

export const SKIP_JAVADOC = 'skipJavadocFormatting';
export const SKIP_REFLOW = 'skipReflowingLongStrings';
export const FORMATTER_VERSION = /^\d+\.\d+(?:\.\d+)?$/u;

export type FormatterDetails = {
  version?: string | undefined;
  options?: string[] | undefined;
};
export type FormatterEntry = FormatterDetails & { formatter: string; aosp?: Optional<boolean> };
export type FormatterFlags = {
  version?: string | undefined;
  formatJavadoc?: Optional<boolean>;
  reflowLongStrings?: Optional<boolean>;
};

const FORMAT_JAVADOC_DEFAULT: Record<string, boolean> = { google: true, palantir: false };

function skipsOf(
  formatter: string,
  { formatJavadoc, reflowLongStrings }: FormatterFlags,
): string[] {
  return [
    ...((formatJavadoc ?? FORMAT_JAVADOC_DEFAULT[formatter]) ? [] : [SKIP_JAVADOC]),
    ...((reflowLongStrings ?? false) ? [] : [SKIP_REFLOW]),
  ];
}

export function stepFormatterDetails(
  formatter: string,
  { version, formatJavadoc, reflowLongStrings }: FormatterFlags,
): FormatterDetails {
  return {
    ...(FORMATTER_VERSION.test(version ?? '') ? { version } : {}),
    options: skipsOf(formatter, { formatJavadoc, reflowLongStrings }),
  };
}

export function mergedDetails(group: FormatterDetails[]): FormatterDetails {
  const found = group.find((entry) => entry.version !== undefined || entry.options !== undefined);
  return {
    ...(found?.version === undefined ? {} : { version: found.version }),
    ...(found?.options === undefined ? {} : { options: found.options }),
  };
}

function signature(entry: FormatterDetails): string {
  return JSON.stringify([entry.version, entry.options]);
}

export function disagree<Entry extends FormatterDetails>(group: Entry[]): Entry | undefined {
  const [first, ...rest] = group.filter((entry) => entry.options !== undefined);
  return first !== undefined && rest.some((entry) => signature(entry) !== signature(first))
    ? first
    : undefined;
}
