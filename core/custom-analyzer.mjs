import { createHash } from 'node:crypto';

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
