#!/usr/bin/env node
import { runFake } from '../test-support/fake-tools/run-fake.mjs';

const [tool, ...args] = process.argv.slice(2);
const { status, stdout, stderr } = runFake({ tool, args, cwd: process.cwd(), env: process.env });
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = status;
