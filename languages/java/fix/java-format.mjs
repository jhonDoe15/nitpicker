import { JAVAC_EXPORTS } from '../maven/maven-lint.mjs';
import {
  readWorkspaceFile,
  runFormatterJar,
  withWorkspace,
  workspaceFile,
  writeWorkspaceFile,
} from './formatter-run.mjs';

const GOOGLE_MAIN = 'com.google.googlejavaformat.java.Main';
const FORMATTERS = {
  google: { label: 'google-java-format', mainClass: GOOGLE_MAIN, flags: [] },
  aosp: { label: 'google-java-format --aosp', mainClass: GOOGLE_MAIN, flags: ['--aosp'] },
  palantir: {
    label: 'palantir-java-format',
    mainClass: 'com.palantir.javaformat.java.Main',
    flags: ['--palantir'],
  },
};

function coordinatesOf(style, pinned) {
  return style === 'palantir'
    ? `com.palantir.javaformat:palantir-java-format:${pinned.palantirJavaFormat}`
    : `com.google.googlejavaformat:google-java-format:${pinned.googleJavaFormat}`;
}

export function javaFormatterPlan(style, pinned) {
  const formatter = FORMATTERS[style];
  return formatter === undefined
    ? undefined
    : {
        label: formatter.label,
        operation: 'java-format-fix',
        tools: { 'java-format': { coordinates: coordinatesOf(style, pinned), transitive: true } },
      };
}

export function javaFormat({ style, classpath, executeFixCommand }) {
  const { label, mainClass, flags } = FORMATTERS[style];
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
          ...entries.map(({ relative }) => workspaceFile(directory, relative)),
        ],
        cwd: directory,
        acceptedStatuses: [0, 1],
        executeFixCommand,
      });
      const unformattable = entries
        .filter(({ relative }) => result.stderr.includes(`${workspaceFile(directory, relative)}:`))
        .map(({ name }) => name);
      if (result.status !== 0 && unformattable.length === 0) {
        throw new Error(`${label} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
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
