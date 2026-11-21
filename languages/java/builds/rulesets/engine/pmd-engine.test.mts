import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseJson } from '../../../../../shared/values/readers.mts';
import {
  ENGINE_LOG,
  ENGINE_SARIF,
  enginePlanOf,
  pmdRulesetsWithEngine,
  type PmdEnginePlan,
} from './pmd-engine.mts';

import { engineWriting, type Started } from '../../test-support/engine-writing.mts';

const XPATH = 'net.sourceforge.pmd.lang.rule.xpath.XPathRule';
const HEAD = '<ruleset name="demo" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

type Setup = { readonly plan: PmdEnginePlan; readonly environment: Record<string, string> };

function setup(): Setup {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-engine-'));
  roots.push(root);
  const reportDir = path.join(root, 'report');
  const javaHome = path.join(root, 'jdk');
  mkdirSync(reportDir);
  mkdirSync(path.join(javaHome, 'jmods'), { recursive: true });
  const main = path.join(root, 'main.xml');
  const tests = path.join(root, 'tests.xml');
  const project = path.join(root, 'project.xml');
  const xpath = (name: string): string =>
    `<rule name="${name}" language="java" class="${XPATH}" message="${name}"><priority>1</priority>` +
    `<properties><property name="xpath"><value>//A</value></property></properties></rule>`;
  writeFileSync(
    main,
    `${HEAD}<exclude-pattern>\\Q${root}/src/test/\\E.*</exclude-pattern>${xpath('Fast')}` +
      '<rule name="Coded" language="java" class="demo.Coded" message="coded"/></ruleset>',
  );
  writeFileSync(
    tests,
    `${HEAD}<exclude-pattern>\\Q${root}/src/main/\\E.*</exclude-pattern>${xpath('FastTest')}</ruleset>`,
  );
  writeFileSync(project, `${HEAD}${xpath('Theirs')}</ruleset>`);
  return {
    plan: {
      reportDir,
      rulesets: [main, project, tests],
      untouched: [project],
      sources: [path.join(root, 'src/main'), path.join(root, 'src/test')],
      auxClasspath: path.join(reportDir, 'aux.txt'),
      pmdJar: path.join(root, 'pmd-java.jar'),
      javaHome,
      suppressMarker: 'NO-MARKER',
    },
    environment: { NITPICKER_ENGINE: process.execPath },
  };
}

describe('pmdRulesetsWithEngine', () => {
  it('runs the XPath rules on the engine and leaves PMD the rules it implements itself', () => {
    const { plan, environment } = setup();
    const root = path.dirname(plan.reportDir);
    const file = path.join(root, 'src/main/A.java');
    const started: Started[] = [];

    const rulesets = pmdRulesetsWithEngine(
      plan,
      environment,
      engineWriting(
        {
          findings: [
            { file, rule: 'Fast', line: 3, column: 5, message: 'Fast' },
            { file, rule: '!Fast', line: 0, column: 0, message: 'failed' },
          ],
          syntaxErrorFiles: [],
        },
        started,
      ),
    );

    expect(rulesets).toEqual([path.join(plan.reportDir, 'pmd-0-coded.xml'), plan.rulesets[1]]);
    expect(started[0]?.argumentList).toEqual([
      ...plan.sources,
      '--rules',
      '_XPath',
      '--classpath',
      plan.auxClasspath,
      '--out',
      path.join(plan.reportDir, 'pmd-engine-report.json'),
    ]);
    expect(started[0]?.environment).toMatchObject({
      NP_XPATH_RULES: path.join(plan.reportDir, 'pmd-engine-rules.json'),
      NP_SUPPRESS_MARKER: 'NO-MARKER',
      NITPICKER_JDK: plan.javaHome,
    });
    expect(
      parseJson(readFileSync(path.join(plan.reportDir, 'pmd-engine-rules.json'), 'utf8')),
    ).toEqual([
      expect.objectContaining({ name: 'Fast', exclude: [`${root}/src/test/.*`] }),
      expect.objectContaining({ name: 'FastTest', exclude: [`${root}/src/main/.*`] }),
    ]);
    expect(parseJson(readFileSync(path.join(plan.reportDir, ENGINE_SARIF), 'utf8'))).toEqual({
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'PMD', rules: [] } },
          results: [
            {
              ruleId: 'Fast',
              message: { text: 'Fast' },
              level: 'error',
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: `file://${file}` },
                    region: { startLine: 3, startColumn: 5 },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(readFileSync(path.join(plan.reportDir, ENGINE_LOG), 'utf8')).toBe(
      `Exception applying rule Fast on file ${file}, continuing with next rule\n`,
    );
    expect(readFileSync(path.join(plan.reportDir, 'pmd-0-coded.xml'), 'utf8')).toContain(
      `<rule ref="${plan.rulesets[0] ?? ''}/Coded"/>`,
    );
  });

  it('hands a file the engine could not parse back to PMD, with the rules that cover it', () => {
    const { plan, environment } = setup();
    const root = path.dirname(plan.reportDir);
    const broken = path.join(root, 'src/test/Broken.java');

    const rulesets = pmdRulesetsWithEngine(
      plan,
      environment,
      engineWriting({
        findings: [{ file: broken, rule: 'FastTest', line: 1, column: 1, message: 'FastTest' }],
        syntaxErrorFiles: [broken],
      }),
    );

    expect(rulesets).toEqual([
      path.join(plan.reportDir, 'pmd-0-coded.xml'),
      plan.rulesets[1],
      path.join(plan.reportDir, 'pmd-2-unparsed.xml'),
    ]);
    const again = readFileSync(path.join(plan.reportDir, 'pmd-2-unparsed.xml'), 'utf8');
    expect(again).toContain(`<include-pattern>\\Q${broken}\\E</include-pattern>`);
    expect(again).toContain(`<rule ref="${plan.rulesets[2] ?? ''}/FastTest"/>`);
    expect(readFileSync(path.join(plan.reportDir, ENGINE_SARIF), 'utf8')).toContain('"results":[]');
  });

  it('leaves every rule to PMD when the engine is off, fails or has no JDK classes to read', () => {
    const { plan, environment } = setup();
    const failing = () => ({ status: 2, stdout: '', stderr: 'no' });
    const unexpected = () => {
      throw new Error('the engine must not start');
    };
    writeFileSync(path.join(plan.reportDir, ENGINE_SARIF), 'stale');

    expect(pmdRulesetsWithEngine(plan, { NITPICKER_ENGINE: 'off' }, unexpected)).toEqual(
      plan.rulesets,
    );
    expect(existsSync(path.join(plan.reportDir, ENGINE_SARIF))).toBe(false);
    expect(pmdRulesetsWithEngine(plan, environment, failing)).toEqual(plan.rulesets);
    expect(
      pmdRulesetsWithEngine({ ...plan, javaHome: plan.reportDir }, environment, unexpected),
    ).toEqual(plan.rulesets);
    expect(existsSync(path.join(plan.reportDir, ENGINE_SARIF))).toBe(false);
  });

  it('leaves every rule to PMD when the engine ends well without a report it can read', () => {
    const { plan, environment } = setup();
    const silent = () => ({ status: 0, stdout: '', stderr: '' });
    const garbled = () => {
      writeFileSync(path.join(plan.reportDir, 'pmd-engine-report.json'), '{"findings": [');
      return silent();
    };
    writeFileSync(path.join(plan.reportDir, 'pmd-engine-report.json'), '{"findings": []}');

    expect(pmdRulesetsWithEngine(plan, environment, silent)).toEqual(plan.rulesets);
    expect(pmdRulesetsWithEngine(plan, environment, garbled)).toEqual(plan.rulesets);
    expect(existsSync(path.join(plan.reportDir, ENGINE_SARIF))).toBe(false);
  });
});

describe('enginePlanOf', () => {
  it('reads the plan the build wrote and appends the guard rulesets', () => {
    expect(enginePlanOf(undefined, '/report', [])).toBeUndefined();
    expect(
      enginePlanOf(
        {
          rulesets: ['/a.xml'],
          untouched: [],
          sources: ['/src'],
          auxClasspath: '/aux.txt',
          pmdJar: '/pmd-java.jar',
          javaHome: '/jdk',
          suppressMarker: 'X',
        },
        '/report',
        ['/guards.xml'],
      ),
    ).toEqual({
      reportDir: '/report',
      rulesets: ['/a.xml', '/guards.xml'],
      untouched: [],
      sources: ['/src'],
      auxClasspath: '/aux.txt',
      pmdJar: '/pmd-java.jar',
      javaHome: '/jdk',
      suppressMarker: 'X',
    });
  });
});
