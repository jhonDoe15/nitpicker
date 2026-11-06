import { containedPath } from '../../../core/fix/common/contained-path.mjs';
import { failureText } from '../../../core/fix/common/fix-command.mjs';
import { JAVA_FORMATTERS } from '../adapters/style/jvm-formatters.mjs';
import { JAVAC_EXPORTS } from '../maven/maven-lint.mjs';
import {
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  writeWorkspaceFile,
} from './formatter-run.mjs';

export function javaFormatterPlan(style, pinned) {
  const formatter = JAVA_FORMATTERS[style];
  return formatter === undefined
    ? undefined
    : {
        label: formatter.label,
        operation: 'java-format-fix',
        tools: { 'java-format': { coordinates: formatter.coordinates(pinned), transitive: true } },
      };
}

export function javaFormat({ style, classpath, executeFixCommand }) {
  const { label, mainClass, flags } = JAVA_FORMATTERS[style];
  return function format(sources) {
    return withWorkspace((directory) => {
      const entries = [...sources.keys()].map((name, index) => ({
        name,
        relative: `${String(index)}/${name.split('/').at(-1)}`,
      }));
      for (const { name, relative } of entries) {
        writeWorkspaceFile(directory, relative, sources.get(name));
      }
      const result = runFormatterJar({
        operation: 'java-format-fix',
        tool: label,
        classpath,
        mainClass,
        jvmArgs: JAVAC_EXPORTS,
        args: [
          ...flags,
          '--replace',
          ...entries.map(({ relative }) => containedPath(directory, relative)),
        ],
        cwd: directory,
        acceptedStatuses: [0, 1],
        executeFixCommand,
      });
      const unformattable = entries
        .filter(({ relative }) => result.stderr.includes(`${containedPath(directory, relative)}:`))
        .map(({ name }) => name);
      if (result.status !== 0 && unformattable.length === 0) {
        throw new Error(`${label} failed: ${failureText(result)}`);
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
