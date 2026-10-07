import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { snapshotAnalyzers } from '../../preset/snapshot/configured-analyzers.mjs';
import {
  clearSnapshotReports,
  renderRuleFilterSection,
  writeSnapshotReports,
} from './reporters.mjs';
import { selectAnalyzers } from '../diff/run-analyzers.mjs';
import { runQualitySnapshot } from './run-snapshot.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

export function parseArguments(arguments_) {
  const analyzerNames = [];
  const ruleFilters = [];
  let outputRoot;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help') {
      return { kind: 'help' };
    }
    if (argument === '--analyzer' || argument === '--rule' || argument === '--output') {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--analyzer') {
        analyzerNames.push(value);
      } else if (argument === '--rule') {
        ruleFilters.push(value);
      } else {
        outputRoot = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { kind: 'run', analyzerNames, ruleFilters, outputRoot };
}

export function runCli({
  arguments_ = process.argv.slice(2),
  currentProjectRoot = projectRoot,
  analyzers = snapshotAnalyzers,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const options = parseArguments(arguments_);
    if (options.kind === 'help') {
      stdout.write(
        'Usage: nitpicker snapshot [--output <directory>]' +
          ' [--analyzer <name>]... [--rule <substring>]...\n',
      );
      return 0;
    }
    const outputRoot =
      options.outputRoot === undefined
        ? path.join(currentProjectRoot, 'reports/quality/snapshot')
        : path.resolve(currentProjectRoot, options.outputRoot);
    clearSnapshotReports(outputRoot);
    const selectedAnalyzers = selectAnalyzers(analyzers, options.analyzerNames);
    if (selectedAnalyzers.length === 0) {
      throw new Error('No quality analyzers are configured.');
    }

    const report = runQualitySnapshot({
      analyzers: selectedAnalyzers,
      projectRoot: currentProjectRoot,
    });
    report.text = writeSnapshotReports(outputRoot, report);
    stdout.write(report.text);
    stdout.write(renderRuleFilterSection(report, options.ruleFilters));
    if (report.summary.overallStatus === 'tool-error') {
      return 2;
    }
    return report.summary.overallStatus === 'violations' ? 1 : 0;
  } catch (error) {
    stderr.write(
      `nitpicker snapshot failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  process.exitCode = runCli();
}
