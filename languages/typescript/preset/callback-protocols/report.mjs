import { format as formatOutput } from 'node:util';
import path from 'node:path';
import { analyzeProductionCallbacks } from './analyze.mjs';
import { readLayout } from '../head-policy.mjs';

const layout = readLayout();

const sourceRoot =
  process.env.CALLBACK_PROTOCOL_SOURCE_ROOT ??
  path.resolve(import.meta.dirname, '../../../..', layout.sourceRoot);
const report = analyzeProductionCallbacks({ sourceRoot, layout });
process.stdout.write(formatOutput(JSON.stringify(report, null, 2)) + '\n');
if (report.findings.length > 0) process.exitCode = 1;
