import path from 'node:path';
import {
  cruise,
  type IFlattenedRuleSet,
  type IReporterOutput,
  type OutputType,
} from 'dependency-cruiser';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import config from '../fixtures/dependency-cruiser.strict.fixture.config.mjs';

const ts = typescriptApi();

type CruiseRequest = {
  readonly baseDir: string;
  readonly paths: readonly string[];
  readonly outputType: OutputType;
};

export type FixtureConfig = {
  readonly forbidden: NonNullable<IFlattenedRuleSet['forbidden']>;
  readonly options: {
    readonly tsConfig: { readonly fileName: string };
    readonly exclude?: { readonly path: string | undefined };
  };
};

export function cruiseWithConfig(
  fixtureConfig: FixtureConfig,
  { baseDir, paths, outputType }: CruiseRequest,
): Promise<IReporterOutput> {
  const tsConfigFile = fixtureConfig.options.tsConfig.fileName;
  const tsConfig = ts.parseJsonConfigFileContent(
    ts.readConfigFile(tsConfigFile, (file) => ts.sys.readFile(file)).config,
    ts.sys,
    path.dirname(tsConfigFile),
    {},
    tsConfigFile,
  );
  const ruleSet = {
    ...structuredClone(fixtureConfig),
    options: { ...structuredClone(fixtureConfig.options), baseDir },
  };
  return cruise(
    [...paths],
    { ruleSet, validate: true, outputType },
    {},
    { tsConfig, babelConfig: {} },
  );
}

export function outputText(result: IReporterOutput): string {
  return typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
}

export function cruiseStrict({
  baseDir,
  paths,
  outputType,
}: CruiseRequest): Promise<IReporterOutput> {
  return cruiseWithConfig(config, { baseDir, paths, outputType });
}
