import path from 'node:path';
import { analyzeProductionCallbacks } from './analyze.mjs';
import { readLayout } from '../head-policy.mjs';

const layout = readLayout();

const sourceRoot =
  process.env.CALLBACK_PROTOCOL_SOURCE_ROOT ??
  path.resolve(import.meta.dirname, '../../../..', layout.sourceRoot);
const report = analyzeProductionCallbacks({ sourceRoot, layout });
console.log(JSON.stringify(report, null, 2));
if (report.findings.length > 0) process.exitCode = 1;
