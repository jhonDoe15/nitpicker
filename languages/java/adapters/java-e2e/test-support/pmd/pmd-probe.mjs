import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { ingestSarifText } from '../../../../../../shared/ingest/sarif.mjs';
import { applyRuleMessages } from '../../../../messages/rule-messages.mjs';
import { INIT_SCRIPT } from '../../../../builds/java-build.mjs';
import { writeRulesets } from '../../../tool-config/pmd-wrappers.mjs';

const ruleset = path.resolve(import.meta.dirname, '../../../gradle/pmd-ruleset.xml');

function scopedRulesets(root) {
  const { mainRuleset, testsRuleset } = writeRulesets({
    module: {
      sourceRoots: [path.join(root, 'src/main/java')],
      testSourceRoots: [path.join(root, 'src/test/java')],
    },
    reportDir: root,
    configs: { pmd: {} },
    spring: false,
  });
  return [ruleset, mainRuleset, testsRuleset].join(',');
}

export function preparePmdProbe(name) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-${name}-`));
  const version = /^\s*pmd\s*:\s*'([^']+)'/mu.exec(readFileSync(INIT_SCRIPT, 'utf8'))[1];
  const sources = path.join(root, 'src');
  writeFileSync(path.join(root, 'settings.gradle'), `rootProject.name = '${name}'\n`);
  writeFileSync(
    path.join(root, 'build.gradle'),
    `plugins { id 'java' }
repositories { mavenCentral() }
configurations { probe }
dependencies {
  probe 'net.sourceforge.pmd:pmd-cli:${version}'
  probe 'net.sourceforge.pmd:pmd-java:${version}'
}
tasks.register('pmdProbe', JavaExec) {
  classpath = configurations.probe
  mainClass = 'net.sourceforge.pmd.cli.PmdCli'
  args 'check', '--no-cache', '--no-progress', '--format', 'sarif',
    '--report-file', 'pmd.sarif', '--dir', ${JSON.stringify(sources)},
    '--rulesets', ${JSON.stringify(scopedRulesets(root))}
  ignoreExitValue = true
}
`,
  );
  return root;
}

export function runPmdProbe(root, gradle) {
  const result = spawnSync(gradle, ['--console=plain', '--quiet', 'pmdProbe'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
}

export function readPmdProbeFindings(root) {
  const report = readFileSync(path.join(root, 'pmd.sarif'), 'utf8');
  return applyRuleMessages(ingestSarifText(report, { tool: 'pmd', root }).findings);
}
