import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { failureText } from '../../../core/fix/common/fix-command.mjs';
import { JAVA_FORMATTERS } from '../adapters/style/jvm-formatters.mjs';
import { JAVAC_EXPORTS } from '../maven/maven-lint.mjs';
import { callUntyped } from '../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../shared/values/readers.mts';
import {
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  writeWorkspaceFile,
} from './formatter-run.mts';

type JavaFormatterPlan = {
  readonly label: string;
  readonly operation: string;
  readonly tools: Readonly<Record<string, unknown>>;
};
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
): JavaFormatterPlan | undefined {
  const formatter = formatterOf(style);
  return formatter === undefined
    ? undefined
    : {
        label: textOf(fieldOf(formatter, 'label')),
        operation: OPERATION,
        tools: {
          'java-format': {
            coordinates: callUntyped(fieldOf(formatter, 'coordinates'), pinned, version),
            transitive: true,
          },
        },
      };
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
      const entries = [...sources.keys()].map((name, index) => ({
        name,
        relative: `${String(index)}/${name.split('/').at(-1) ?? name}`,
      }));
      for (const { name, relative } of entries) {
        writeWorkspaceFile(directory, relative, sources.get(name) ?? '');
      }
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
