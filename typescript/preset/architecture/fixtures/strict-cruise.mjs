import path from 'node:path';
import ts from 'typescript';
import { cruise } from 'dependency-cruiser';
import config from './dependency-cruiser.strict.fixture.config.mjs';

// The strict fixture config run in-process through dependency-cruiser's JS API. It mirrors what the
// CLI does for `dependency-cruise <paths> --config <config>`: validates the rule set, reads the
// fixture tsconfig, and resolves input paths against `baseDir` instead of the working directory.
const tsConfigFile = config.options.tsConfig.fileName;
const tsConfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(tsConfigFile, ts.sys.readFile).config,
  ts.sys,
  path.dirname(tsConfigFile),
  {},
  tsConfigFile,
);

export async function cruiseStrict({ baseDir, paths, outputType }) {
  const ruleSet = structuredClone(config);
  ruleSet.options.baseDir = baseDir;
  return cruise(paths, { ruleSet, validate: true, outputType }, {}, { tsConfig, babelConfig: {} });
}
