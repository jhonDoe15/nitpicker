import type { JavaFinding } from '../../typed/java-values.mts';
import {
  type KotlinFinding,
  type Metrics,
  kotlinModules,
  readKotlinCrapFindings as readCrapFindings,
  readKotlinMetrics,
  readKotlinStructureFindings,
} from '../kotlin-metrics.mts';

export type { KotlinFinding, Metrics, MetricsFunction } from '../kotlin-metrics.mts';
export { kotlinModules, readKotlinMetrics, readKotlinStructureFindings };

type CrapOptions = {
  readonly projectRoot: string;
  readonly jacoco: string;
  readonly crapLimit?: number;
};

function isKotlinFinding(finding: JavaFinding): finding is KotlinFinding {
  return (
    typeof finding['symbol'] === 'string' &&
    typeof finding['identity'] === 'string' &&
    typeof finding['message'] === 'string' &&
    typeof finding['classification'] === 'string' &&
    typeof finding['location'] === 'object'
  );
}

export function readKotlinCrapFindings(metrics: Metrics, options: CrapOptions): KotlinFinding[] {
  return readCrapFindings(metrics, options).filter(isKotlinFinding);
}
