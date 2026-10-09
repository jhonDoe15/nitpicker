import path from 'node:path';
import ts from 'typescript';
import { cruise } from 'dependency-cruiser';
import config from './dependency-cruiser.strict.fixture.config.mjs';

// Fixture configs run in-process through dependency-cruiser's JS API. Each mirrors what the CLI does
// for `dependency-cruise <paths> --config <config>`: validates the rule set, reads the fixture
// tsconfig, and resolves input paths against `baseDir` instead of the working directory. A CLI run
// starts a new node process that re-imports typescript and dependency-cruiser on every call.
export function cruiseWithConfig(fixtureConfig, { baseDir, paths, outputType }) {
  const tsConfigFile = fixtureConfig.options.tsConfig.fileName;
  const tsConfig = ts.parseJsonConfigFileContent(
    ts.readConfigFile(tsConfigFile, ts.sys.readFile).config,
    ts.sys,
    path.dirname(tsConfigFile),
    {},
    tsConfigFile,
  );
  const ruleSet = structuredClone(fixtureConfig);
  ruleSet.options.baseDir = baseDir;
  return cruise(paths, { ruleSet, validate: true, outputType }, {}, { tsConfig, babelConfig: {} });
}

export function cruiseStrict({ baseDir, paths, outputType }) {
  return cruiseWithConfig(config, { baseDir, paths, outputType });
}
