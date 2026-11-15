import { createEslintAnalyzer as untypedEslintAnalyzer } from '../../eslint/analyzer.mjs';
import { createStaticCheckAnalyzer as untypedStaticCheckAnalyzer } from '../../static-checks/analyzer.mjs';

type AnalyzerShape = {
  readonly requiresDependencies: boolean;
  readonly concurrencyGroup?: string;
};

type AnalyzerOptions = object;

type AnalyzerFactory = { create(options: AnalyzerOptions): AnalyzerShape };

export const createEslintAnalyzer: AnalyzerFactory['create'] = untypedEslintAnalyzer;

export const createStaticCheckAnalyzer: AnalyzerFactory['create'] = untypedStaticCheckAnalyzer;
