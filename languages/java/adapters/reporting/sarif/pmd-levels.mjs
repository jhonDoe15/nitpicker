function withoutLevel(entry) {
  const { level, ...rest } = entry;
  return level === 'error' ? entry : rest;
}

function withoutDefaultLevel(rule) {
  const configuration = rule.defaultConfiguration;
  if (configuration?.level === undefined || configuration.level === 'error') {
    return rule;
  }
  const { level, ...rest } = configuration;
  return { ...rule, defaultConfiguration: rest };
}

export function withPmdLevels(log) {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map(withoutLevel),
      ...(run.tool?.driver?.rules === undefined
        ? {}
        : {
            tool: {
              ...run.tool,
              driver: { ...run.tool.driver, rules: run.tool.driver.rules.map(withoutDefaultLevel) },
            },
          }),
    })),
  };
}
