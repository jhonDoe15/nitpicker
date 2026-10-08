import { createHash } from 'node:crypto';

/**
 * Wraps a `{name, command, args?}` config entry as an analyzer. The executable runs with the
 * analyzed checkout as its working directory (so a relative command resolves inside each side),
 * prints findings JSON on stdout, and exits 0. Its stdout goes through the same finding parser
 * as the built-in analyzers; a non-zero exit or invalid JSON becomes a tool error.
 */
export function createCustomAnalyzer({ name, command, args = [] }) {
  return {
    name,
    version: 'custom',
    configurationHash: createHash('sha256')
      .update(JSON.stringify({ name, command, args }))
      .digest('hex'),
    exclusions: [],
    createInvocation({ projectRoot, snapshot }) {
      return {
        command,
        args,
        cwd: projectRoot,
        env: {
          ...process.env,
          NITPICKER_ANALYZER: name,
          NITPICKER_PROJECT_ROOT: projectRoot,
          ...(snapshot === undefined ? {} : { NITPICKER_SNAPSHOT: snapshot }),
        },
      };
    },
  };
}

/** Appends the configured custom analyzers; a name clash with another analyzer is a config error. */
export function addCustomAnalyzers(analyzers, entries = []) {
  const taken = new Set(analyzers.map(({ name }) => name));
  const custom = entries.map((entry) => {
    if (taken.has(entry.name)) {
      throw new Error(
        `nitpicker.config.json: analyzers entry "${entry.name}" clashes with another analyzer name`,
      );
    }
    taken.add(entry.name);
    return createCustomAnalyzer(entry);
  });
  return [...analyzers, ...custom];
}
