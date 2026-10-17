import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadPolicy } from '../../head-policy.mjs';
import { defaultTestFiles } from './test-file-patterns.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryDirectory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-head-policy-runner-'));
  temporaryRoots.push(root);
  return root;
}

describe('head policy test runner fact', () => {
  function runnerOf(files, config = {}) {
    const root = temporaryDirectory();
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(path.join(root, name), text);
    }
    return resolveHeadPolicy(config, root).tools?.tests;
  }

  it('records the runner the head checkout shows, so the lint config can follow it', () => {
    expect(runnerOf({ 'package.json': '{"scripts":{"test":"jest"}}' })).toEqual({
      detectedRunner: 'jest',
      testFiles: defaultTestFiles('jest'),
    });
    expect(runnerOf({ 'package.json': '{"scripts":{"test":"node --test"}}' })).toEqual({
      detectedRunner: 'node',
      testFiles: defaultTestFiles('node'),
    });
    expect(runnerOf({ '.mocharc.json': '{}' })).toEqual({
      detectedRunner: 'mocha',
      testFiles: defaultTestFiles('mocha'),
    });
    expect(runnerOf({})).toEqual({
      detectedRunner: 'vitest',
      testFiles: defaultTestFiles('vitest'),
    });
  });

  it('records the test files of the node:test script patterns', () => {
    const manifest = { scripts: { test: "node --test --test-name-pattern=x 'checks/**/*.js'" } };

    expect(runnerOf({ 'package.json': JSON.stringify(manifest) })?.testFiles).toEqual({
      include: ['checks/**/*.js'],
      exclude: [],
      includeRegexes: [],
      excludeRegexes: [],
    });
  });

  it('keeps the configured runner next to the detected one, and records its test files', () => {
    const config = { tools: { tests: { runner: 'mocha' } } };

    expect(runnerOf({ 'package.json': '{"scripts":{"test":"jest"}}' }, config)).toEqual({
      runner: 'mocha',
      detectedRunner: 'jest',
      testFiles: defaultTestFiles('mocha'),
    });
  });

  it('records it for a JavaScript preset too, and for no other preset', () => {
    const files = { 'package.json': '{"scripts":{"test":"mocha"}}' };

    expect(runnerOf(files, { preset: 'javascript' })).toEqual({
      detectedRunner: 'mocha',
      testFiles: defaultTestFiles('mocha'),
    });
    expect(runnerOf(files, { preset: 'java' })).toBeUndefined();
  });
});
