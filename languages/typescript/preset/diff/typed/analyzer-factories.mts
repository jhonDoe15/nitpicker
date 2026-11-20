import { createEntryPointAnalyzer as untypedEntryPoint } from '../../../adapters/entry-points.mts';
import { createEslintAnalyzer as untypedEslint } from '../../../adapters/eslint/analyzer.mts';
import { createQualityAreaAnalyzer as untypedQualityArea } from '../../../adapters/quality-areas/analyzer.mts';
import { createStaticCheckAnalyzer as untypedStaticCheck } from '../../../adapters/static-checks/analyzer.mts';
import type {
  AnalyzerBody,
  EntryPointSettings,
  EslintSettings,
  QualityAreaSettings,
  StaticCheckSettings,
} from './analyzer-types.mts';

function isAnalyzerBody(value: unknown): value is AnalyzerBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'createInvocation' in value &&
    typeof value.createInvocation === 'function'
  );
}

function analyzerBodyOf(value: unknown): AnalyzerBody {
  if (!isAnalyzerBody(value)) {
    throw new TypeError('An analyzer factory must return an analyzer');
  }
  return value;
}

export function createEntryPointAnalyzer(settings: EntryPointSettings): AnalyzerBody {
  return analyzerBodyOf(Reflect.apply(untypedEntryPoint, undefined, [settings]));
}

export function createQualityAreaAnalyzer(settings: QualityAreaSettings): AnalyzerBody {
  return analyzerBodyOf(Reflect.apply(untypedQualityArea, undefined, [settings]));
}

export function createStaticCheckAnalyzer(settings: StaticCheckSettings): AnalyzerBody {
  return analyzerBodyOf(Reflect.apply(untypedStaticCheck, undefined, [settings]));
}

export function createEslintAnalyzer(settings: EslintSettings): AnalyzerBody {
  return analyzerBodyOf(Reflect.apply(untypedEslint, undefined, [settings]));
}
