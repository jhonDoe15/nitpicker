import path from 'node:path';
import { analyzeProductionCallbacks } from './analyze.mjs';

const sourceRoot =
  process.env.CALLBACK_PROTOCOL_SOURCE_ROOT ?? path.resolve(import.meta.dirname, '../../src/main');
const report = analyzeProductionCallbacks({ sourceRoot });
console.log(JSON.stringify(report, null, 2));
if (report.findings.length > 0) process.exitCode = 1;
