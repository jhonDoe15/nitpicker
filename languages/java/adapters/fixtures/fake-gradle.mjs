#!/usr/bin/env node
import { runFakeGradle } from '../test-support/fake-gradle/run-fake-gradle.mjs';

const { status, stdout, stderr } = runFakeGradle({
  args: process.argv.slice(2),
  cwd: process.cwd(),
});
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = status;
