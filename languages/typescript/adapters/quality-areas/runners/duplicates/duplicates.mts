import path from 'node:path';
import { readFileSync, writeFileSync, realpathSync, unlinkSync } from 'node:fs';
import type { Finding } from '../../../static-checks/shared.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { fieldOf, fieldsOf, listOf } from '../../../../../../shared/values/readers.mts';
import { existingRoots } from '../../../typed/static-checks.mts';
import { readLayout } from '../../../typed/head-policy.mts';
import { trackTemporaryPath } from '../../../typed/tooling.mts';
import { parseReportJson, runNodeTool } from '../../typed/tooling.mts';
import {
  type JscpdConfig,
  type JscpdRun,
  type RenamedReport,
  layeredJscpdConfig,
  layoutJscpdConfig,
  normalizeDuplicates,
  renamedDuplicatesReport,
  rootsPattern,
} from '../../typed/repository.mts';

function duplicatesJscpdConfig(options: QualityAreaOptions): JscpdConfig {
  const config = layoutJscpdConfig(
    parseReportJson(
      readFileSync(
        path.join(options.policyRoot, 'languages/typescript/preset/defaults/jscpd.json'),
        'utf8',
      ),
    ),
    readLayout(),
  );
  const layered = layeredJscpdConfig(config);
  return { ...layered, path: existingRoots(options.projectRoot, config.path) };
}

function jscpdRunner(options: QualityAreaOptions): JscpdRun {
  return function runJscpd({ configPath, cwd = options.projectRoot }): unknown {
    return runNodeTool({
      options,
      relativeToolPath: 'jscpd/run-jscpd.js',
      arguments_: ['--config', configPath],
      cwd,
      acceptedStatuses: [0],
    });
  };
}

function duplicatesNormalizeOptions(
  options: QualityAreaOptions,
  renamed: RenamedReport | undefined,
): Parameters<typeof normalizeDuplicates>[2] {
  return {
    configuredPaths: [],
    projectRoot: options.projectRoot,
    renamedReport:
      renamed === undefined ? undefined : withProjectRelativeNames(renamed.report, renamed.root),
  };
}

function runDuplicatesReport(
  options: QualityAreaOptions,
  config: JscpdConfig,
  outputDirectory: string,
): { readonly report: unknown; readonly renamed: RenamedReport | undefined } {
  const runJscpd = jscpdRunner(options);
  const configName = '.nitpicker-diff-jscpd.json';
  const configPath = path.join(options.projectRoot, configName);
  trackTemporaryPath(configPath);
  const settings = {
    ...config,
    path: ['.'],
    pattern: rootsPattern(config.path),
    absolute: false,
    reporters: ['json'],
    output: outputDirectory,
  };
  writeFileSync(configPath, `${JSON.stringify(settings)}\n`);
  try {
    runJscpd({ configPath: configName });
    const report: unknown = JSON.parse(
      readFileSync(path.join(outputDirectory, 'jscpd-report.json'), 'utf8'),
    );
    const renamed = renamedDuplicatesReport({
      projectRoot: options.projectRoot,
      config,
      runJscpd,
      scratchRoot: outputDirectory,
    });
    return { report, renamed };
  } finally {
    unlinkSync(configPath);
  }
}

export function runDuplicates(options: QualityAreaOptions): Finding[] {
  const config = duplicatesJscpdConfig(options);
  if (config.path.length === 0) {
    return [];
  }
  const outputDirectory = path.join(options.projectRoot, 'reports/quality/duplicates');
  const { report, renamed } = runDuplicatesReport(options, config, outputDirectory);
  return normalizeDuplicates(
    withProjectRelativeNames(report, realpathSync(options.projectRoot)),
    options.analyzerName,
    duplicatesNormalizeOptions(options, renamed),
  );
}

function projectRelativeSide(side: unknown, projectRoot: string): unknown {
  const name = fieldOf(side, 'name');
  return typeof name === 'string' && path.isAbsolute(name)
    ? { ...fieldsOf(side), name: path.relative(projectRoot, name) }
    : side;
}

function withProjectRelativeNames(report: unknown, projectRoot: string): unknown {
  return {
    ...fieldsOf(report),
    duplicates: listOf(fieldOf(report, 'duplicates')).map((duplicate) => ({
      ...fieldsOf(duplicate),
      firstFile: projectRelativeSide(fieldOf(duplicate, 'firstFile'), projectRoot),
      secondFile: projectRelativeSide(fieldOf(duplicate, 'secondFile'), projectRoot),
    })),
  };
}
