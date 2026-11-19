import { classLimitFindings as untypedClassLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { inheritanceDepths } from '../size/inheritance.mts';
import { inModule } from '../../builds/module-path.mts';
import type { KotlinFinding, Metrics } from './kotlin-metrics.mts';

type FileInfo = { package: string; imports: readonly string[] };
type Limits = {
  thresholds?: Readonly<Record<string, number>> | undefined;
  exceptions?: readonly { rule: string; paths: readonly string[] }[] | undefined;
  modulePath?: string | undefined;
};

const classLimitFindings: (
  classes: readonly object[],
  options: {
    analyzerName: string;
    thresholds: Limits['thresholds'];
    exceptions: Limits['exceptions'];
    projectPath: (file: string) => string;
  },
) => KotlinFinding[] = untypedClassLimitFindings;

export function readKotlinClassLimitFindings(
  metrics: Metrics,
  { thresholds, exceptions, modulePath }: Limits = {},
): KotlinFinding[] {
  const types = metrics.types ?? [];
  const files = Object.fromEntries(
    metrics.files.map((file): [string, FileInfo] => [
      file.file,
      { package: file.package ?? '', imports: file.imports ?? [] },
    ]),
  );
  const depths = inheritanceDepths({ classes: types, files });
  return classLimitFindings(
    types.map((type) => ({ ...type, inheritanceDepth: depths.get(type) ?? 0 })),
    {
      analyzerName: 'structure',
      thresholds,
      exceptions,
      projectPath: (file) => inModule(modulePath, file),
    },
  );
}
