import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  removeGitRepositories,
} from '../../../core/diff/fixtures/git-repository.mjs';
import { trackedFiles } from '../tracked-files.mjs';
import { LARGE_FILE_BYTES } from '../rules.mjs';
import { collectRepositoryFindings } from './repository-files.mjs';

afterEach(removeGitRepositories);

const PRIVATE_KEY_HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');

function check(files) {
  const { root } = createGitRepository(files);
  return collectRepositoryFindings({ projectRoot: root, files: trackedFiles(root) });
}

const summary = (findings) => findings.map(({ rule, path }) => `${rule} ${path}`);

describe('committed env files', () => {
  it('flags .env and its variants but not templates', () => {
    const findings = check({
      '.env': 'API_KEY=sk_live_1\n',
      '.env.production': 'A=1\n',
      'config/prod.env': 'A=1\n',
      '.env.example': 'API_KEY=\n',
      '.env.local.sample': 'A=\n',
      'example.env': 'A=\n',
      'src/environment.ts': 'export {};\n',
    });

    expect(summary(findings)).toEqual([
      'committed-env-file .env',
      'committed-env-file .env.production',
      'committed-env-file config/prod.env',
    ]);
    expect(findings[0]).toMatchObject({
      tool: 'repository-hygiene',
      identity: 'file:.env',
      classification: 'enforceable',
    });
    expect(findings[0].message).toContain('.env.example');
    expect(findings[0].message).toContain('"exceptions" in nitpicker.config.json');
  });
});

describe('committed private keys', () => {
  it('flags key files by name and any text file that holds a key block', () => {
    const findings = check({
      'deploy/id_rsa': 'x\n',
      'ssl/server.p12': 'x\n',
      'ssl/server.pem': `${PRIVATE_KEY_HEADER}\nabc\n`,
      'ssl/ca.pem': '-----BEGIN CERTIFICATE-----\nabc\n',
      'src/fixture.json': `{"key": "${PRIVATE_KEY_HEADER}"}\n`,
      'ssh/id_rsa.pub': 'ssh-rsa AAAA\n',
      'src/index.ts': 'export {};\n',
    });

    expect(summary(findings)).toEqual([
      'committed-private-key deploy/id_rsa',
      'committed-private-key src/fixture.json',
      'committed-private-key ssl/server.p12',
      'committed-private-key ssl/server.pem',
    ]);
    expect(findings[0].message).toContain('rotate the key');
  });
});

describe('binaries and large files', () => {
  it('flags archives and compiled binaries but allows the Gradle wrapper', () => {
    const findings = check({
      'libs/tool.jar': 'x',
      'gradle/wrapper/gradle-wrapper.jar': 'x',
      'dist/app.zip': 'x',
      'native/addon.node': 'x',
      'src/main.ts': 'x',
    });

    expect(summary(findings)).toEqual([
      'committed-binary dist/app.zip',
      'committed-binary libs/tool.jar',
      'committed-binary native/addon.node',
    ]);
  });

  it('flags a file over the size limit, once, and spares lockfiles', () => {
    const oversize = 'a'.repeat(LARGE_FILE_BYTES + 1);
    const findings = check({
      'assets/hero.png': oversize,
      'assets/exact.png': 'a'.repeat(LARGE_FILE_BYTES),
      'package-lock.json': oversize,
      'uv.lock': oversize,
      'big.bin': oversize,
    });

    expect(summary(findings)).toEqual(['large-file assets/hero.png', 'committed-binary big.bin']);
    expect(findings[0].message).toContain('1.0 MB');
    expect(findings[0].message).toContain('limit 1 MB');
  });

  it('reports nothing for an ordinary tree', () => {
    expect(check({ 'src/a.ts': 'export {};\n', 'README.md': '# a\n' })).toEqual([]);
  });
});
