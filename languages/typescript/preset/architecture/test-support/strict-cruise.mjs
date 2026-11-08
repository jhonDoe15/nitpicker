import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { cruise } from 'dependency-cruiser';
import config from '../fixtures/dependency-cruiser.strict.fixture.config.mjs';

export function cruiseWithConfig(fixtureConfig, { baseDir, paths, outputType }) {
  const tsConfigFile = fixtureConfig.options.tsConfig.fileName;
  const tsConfig = ts.parseJsonConfigFileContent(
    ts.readConfigFile(tsConfigFile, (file) => ts.sys.readFile(file)).config,
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
