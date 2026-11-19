import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HOSTS_OFF_VARIABLE, HOSTS_VARIABLE, hostEnvironment } from './host-environment.config.mts';
import {
  HOSTED_TOOLS,
  HOST_CONFIG_FILE,
  PLAIN_TOOL,
  hostCap,
  hostedTool,
  hostsDirectory,
  readHostConfig,
  socketFits,
} from './host-config.mts';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('hostsDirectory', () => {
  it('is the directory the run passed down', () => {
    expect(hostsDirectory(hostEnvironment({ [HOSTS_VARIABLE]: '/work/hosts' }))).toBe(
      '/work/hosts',
    );
  });

  it.each([
    [{}],
    [{ [HOSTS_VARIABLE]: '' }],
    [{ [HOSTS_VARIABLE]: '/w', [HOSTS_OFF_VARIABLE]: '1' }],
  ])('is undefined without a directory or with hosting turned off: %j', (env) => {
    expect(hostsDirectory(hostEnvironment(env))).toBeUndefined();
  });
});

describe('hostedTool', () => {
  it('lists the tools that passed the parity test, and nothing else', () => {
    expect(Object.keys(HOSTED_TOOLS).toSorted()).toEqual([
      'CpdReport',
      'GeneratedClasses',
      'StructureMetrics',
      'com.google.googlejavaformat.java.Main',
      'com.puppycrawl.tools.checkstyle.Main',
      'de.thetaphi.forbiddenapis.cli.CliMain',
      'io.gitlab.arturbosch.detekt.cli.Main',
      'net.sourceforge.pmd.cli.PmdCli',
      'nitpicker.effects.Effects',
      'nitpicker.kotlinpsi.KotlinPsi',
    ]);
  });

  it.each([
    [undefined],
    ['ErrorProneReport'],
    ['toString'],
    ['ArchRules'],
    ['edu.umd.cs.findbugs.FindBugs2'],
  ])('does not host %s', (mainClass) => {
    expect(hostedTool(mainClass)).toBeUndefined();
  });

  it('takes the tools a caller allows', () => {
    const fresh = { ...PLAIN_TOOL, loader: 'fresh' } as const;

    expect(hostedTool('a.B', { 'a.B': fresh })).toEqual(fresh);
  });
});

describe('hostCap', () => {
  const GIB = 1024 ** 3;

  it('keeps the idle memory of the hosts within a share of the machine', () => {
    expect(hostCap(16 * GIB)).toBe(14);
    expect(hostCap(8 * GIB)).toBe(8);
  });

  it('turns hosting off on a machine too small for a useful number of hosts', () => {
    expect(hostCap(2 * GIB)).toBeUndefined();
  });
});

describe('socketFits', () => {
  it('rejects a socket path longer than a Unix socket address allows', () => {
    expect(socketFits('/tmp/hosts', 'abcdef012345')).toBe(true);
    expect(socketFits(`/tmp/${'d'.repeat(100)}`, 'abcdef012345')).toBe(false);
  });
});

describe('readHostConfig', () => {
  function directory(config: string | undefined): string {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-hostcfg-'));
    roots.push(root);
    mkdirSync(root, { recursive: true });
    if (config !== undefined) writeFileSync(path.join(root, HOST_CONFIG_FILE), config);
    return root;
  }

  it('reads what the run wrote', () => {
    const config = { owner: 7, classpath: '/a:/b', maxHosts: 3 };

    expect(readHostConfig(directory(JSON.stringify(config)))).toEqual(config);
  });

  it.each([[undefined], ['not json'], ['{"owner":"x"}'], ['null']])(
    'is undefined for a missing or damaged file: %s',
    (text) => {
      expect(readHostConfig(directory(text))).toBeUndefined();
    },
  );
});
