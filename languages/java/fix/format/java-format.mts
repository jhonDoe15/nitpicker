import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { failureText } from '../../../../core/fix/common/fix-command.mjs';
import { JAVA_FORMATTERS } from '../../adapters/style/jvm-formatters.mts';
import { JAVAC_EXPORTS } from '../../maven/maven-lint.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import {
  type FormatterPlan,
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  writeWorkspaceFile,
} from './formatter-run.mts';

type JavaFormatRequest = {
  readonly style: string;
  readonly flags?: readonly string[];
  readonly classpath: unknown;
  readonly java: unknown;
  readonly executeFixCommand: unknown;
};
type Formatted = {
  readonly formatted: Map<string, string>;
  readonly unformattable: string[];
};

const OPERATION = 'java-format-fix';
const javacExports: readonly string[] = JAVAC_EXPORTS;

function formatterOf(style: string): unknown {
  return fieldOf(JAVA_FORMATTERS, style);
}

export function javaFormatterPlan(
  style: string,
  pinned: unknown,
  version: unknown,
): FormatterPlan | undefined {
  const formatter = formatterOf(style);
  return formatter === undefined
    ? undefined
    : {
        label: textOf(fieldOf(formatter, 'label')),
        operation: OPERATION,
        tools: {
          'java-format': {
            coordinates: textOf(callUntyped(fieldOf(formatter, 'coordinates'), pinned, version)),
            transitive: true,
          },
        },
      };
}

function writtenEntries(
  directory: string,
  sources: ReadonlyMap<string, string | Uint8Array>,
): { readonly name: string; readonly relative: string }[] {
  const entries = [...sources].map(([name, content], index) => ({
    name,
    content,
    relative: `${String(index)}/${name.split('/').at(-1) ?? name}`,
  }));
  for (const { relative, content } of entries) {
    writeWorkspaceFile(directory, relative, content);
  }
  return entries.map(({ name, relative }) => ({ name, relative }));
}

export function javaFormat({
  style,
  flags: optionFlags = [],
  classpath,
  java,
  executeFixCommand,
}: JavaFormatRequest): (sources: ReadonlyMap<string, string | Uint8Array>) => Formatted {
  const formatter = formatterOf(style);
  const label = textOf(fieldOf(formatter, 'label'));
  const mainClass = textOf(fieldOf(formatter, 'mainClass'));
  const flags = textsOf(fieldOf(formatter, 'flags'));
  return function format(sources) {
    return withWorkspace((directory) => {
      const entries = writtenEntries(directory, sources);
      const result = runFormatterJar({
        operation: OPERATION,
        tool: label,
        java,
        classpath,
        mainClass,
        jvmArgs: javacExports,
        args: [
          ...flags,
          ...optionFlags,
          '--replace',
          ...entries.map(({ relative }): string => containedPath(directory, relative)),
        ],
        cwd: directory,
        acceptedStatuses: [0, 1],
        executeFixCommand,
      });
      const stderr = textOf(fieldOf(result, 'stderr'));
      const unformattable = entries
        .filter(({ relative }) => stderr.includes(`${textOf(containedPath(directory, relative))}:`))
        .map(({ name }) => name);
      if (fieldOf(result, 'status') !== 0 && unformattable.length === 0) {
        throw new Error(`${label} failed: ${textOf(failureText(result))}`);
      }
      return {
        formatted: new Map(
          entries.map(({ name, relative }) => [name, readWorkspaceFile(directory, relative)]),
        ),
        unformattable,
      };
    });
  };
}
