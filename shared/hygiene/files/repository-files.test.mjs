import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  removeGitRepositories,
} from '../../../core/diff/fixtures/git-repository.mjs';
import { trackedFiles } from '../tracked-files.mjs';
import { LARGE_FILE_BYTES, withoutExcepted } from '../rules.mjs';
import { collectRepositoryFindings } from './repository-files.mjs';

afterEach(removeGitRepositories);

const PRIVATE_KEY_HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');

function check(files, change = () => undefined) {
  const { root } = createGitRepository(files);
  change(root);
  return collectRepositoryFindings({ projectRoot: root, files: trackedFiles(root) });
}

const summary = (findings) => findings.map(({ rule, path: file }) => `${rule} ${file}`);

describe('committed env files', () => {
  it('flags env files and their variants, but not templates or source files', () => {
    const findings = check({
      '.env': 'API_KEY=sk_live_1\n',
      '.env.production': 'A=1\n',
      '.env.sample.prod': 'A=1\n',
      '.env.example.local': 'A=1\n',
      '.env-staging': 'A=1\n',
      '.envrc': 'export TOKEN=1\n',
      'env.prod': 'A=1\n',
      'config/prod.env': 'A=1\n',
      '.env.example': 'API_KEY=\n',
      '.env.local.sample': 'A=\n',
      'example.env': 'A=\n',
      'src/.env.d.ts': 'export {};\n',
      'src/env.ts': 'export {};\n',
      'src/environment.ts': 'export {};\n',
    });

    expect(summary(findings)).toEqual([
      'committed-env-file .env',
      'committed-env-file .env-staging',
      'committed-env-file .env.example.local',
      'committed-env-file .env.production',
      'committed-env-file .env.sample.prod',
      'committed-env-file .envrc',
      'committed-env-file config/prod.env',
      'committed-env-file env.prod',
    ]);
    expect(findings[0]).toEqual({
      tool: 'repository-hygiene',
      rule: 'committed-env-file',
      path: '.env',
      identity: 'file:.env',
      message:
        'Environment file .env is committed and usually holds secrets. Remove it, rotate what it held, ' +
        'and commit a .env.example with placeholder values. If this is intended, add ' +
        '{"rule":"committed-env-file","paths":[".env"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      classification: 'enforceable',
    });
  });

  it('leaves env files that hold only public build-time values', () => {
    const findings = check({
      '.env.development': '# shown in the browser\nVITE_API_URL=https://example.test\n\n',
      '.env.test': 'export NEXT_PUBLIC_SITE=demo\r\nPUBLIC_FLAG=1\n',
      '.env.empty': '# nothing yet\n',
      '.env.local': 'VITE_API_URL=https://example.test\nDATABASE_URL=postgres://secret\n',
      '.env.multiline': 'VITE_A=1\n  continued\n',
    });

    expect(summary(findings)).toEqual([
      'committed-env-file .env.local',
      'committed-env-file .env.multiline',
    ]);
  });
});

describe('committed private keys', () => {
  it('flags key blocks in any text file and key stores by name, but not trust stores', () => {
    const findings = check({
      'deploy/id_rsa': 'x\n',
      'ssl/server.p12': 'x\n',
      'ssl/server.pem': `${PRIVATE_KEY_HEADER}\nabc\n`,
      'ssl/ca.pem': '-----BEGIN CERTIFICATE-----\nabc\n',
      'src/fixture.json': `{"key": "${PRIVATE_KEY_HEADER}"}\n`,
      'src/test/resources/truststore.jks': 'x\n',
      'jre/lib/security/cacerts': 'x\n',
      'ssh/id_rsa.pub': 'ssh-rsa AAAA\n',
    });

    expect(findings.map(({ message }) => message.split('. ')[0])).toEqual([
      'deploy/id_rsa may hold a private key',
      'src/fixture.json holds a private key',
      'ssl/server.p12 may hold a private key',
      'ssl/server.pem holds a private key',
    ]);
  });
});

describe('binaries and large files', () => {
  it('flags archives and compiled binaries, but not the tooling projects commit on purpose', () => {
    const findings = check({
      'libs/tool.jar': 'x',
      'release/app.zip': 'x',
      'native/addon.node': 'x',
      'gradle/wrapper/gradle-wrapper.jar': 'x',
      '.mvn/wrapper/maven-wrapper.jar': 'x',
      '.yarn/releases/yarn-4.5.0.cjs': 'x',
      '.yarn/cache/lodash-npm-4.17.21.zip': 'x',
      '.yarn/plugins/plugin.cjs': 'x',
      'vendor/nitpicker-1.0.0.tgz': 'x',
      'vendor/other-1.0.0.tgz': 'x',
      'web/vendor/lib-2.0.0.tgz': 'x',
      'package.json': JSON.stringify({
        devDependencies: { nitpicker: 'file:vendor/nitpicker-1.0.0.tgz', zod: '^4.0.0' },
      }),
      'web/package.json': JSON.stringify({ dependencies: { lib: 'file:./vendor/lib-2.0.0.tgz' } }),
      'broken/package.json': '{',
    });

    expect(summary(findings)).toEqual([
      'committed-binary libs/tool.jar',
      'committed-binary native/addon.node',
      'committed-binary release/app.zip',
      'committed-binary vendor/other-1.0.0.tgz',
    ]);
  });

  it('flags a committed file over the size limit, but not lock files or tooling', () => {
    const oversize = 'a'.repeat(LARGE_FILE_BYTES + 1);
    const findings = check({
      'assets/hero.png': oversize,
      'assets/exact.png': 'a'.repeat(LARGE_FILE_BYTES),
      'package-lock.json': oversize,
      'npm-shrinkwrap.json': oversize,
      'gradle.lockfile': oversize,
      'data/report-lock.json': oversize,
      '.pnp.cjs': oversize,
    });

    expect(summary(findings)).toEqual([
      'large-file assets/hero.png',
      'large-file data/report-lock.json',
    ]);
    expect(findings[0].message.split('. ')[0]).toBe('assets/hero.png is 1.0 MB (limit 1 MB)');
  });

  it('sizes what git stores, so a large-file storage pointer passes', () => {
    const findings = check(
      { 'design.psd': 'version https://git-lfs.github.com/spec/v1\n' },
      (root) => {
        writeFileSync(path.join(root, 'design.psd'), 'a'.repeat(LARGE_FILE_BYTES + 1));
      },
    );

    expect(findings).toEqual([]);
  });
});

describe('committed build output', () => {
  const manifest = (value) => JSON.stringify(value);
  const folders = (findings) =>
    findings.map(({ rule, path: anchor, identity }) => `${rule} ${identity} at ${anchor}`);

  it('flags output folders next to a project manifest and framework caches anywhere, once each', () => {
    const findings = check({
      'package.json': manifest({ name: 'app', private: true }),
      'dist/index.js': 'x',
      'dist/assets/index-1a2b.js': 'x',
      'coverage/lcov.info': 'x',
      'packages/web/package.json': manifest({ name: 'web' }),
      'packages/web/build/index.html': 'x',
      'packages/web/build/static/js/main.3f2a9c1b.js': 'x',
      'apps/site/.next/cache/data': 'x',
      'docs/storybook-static/index.html': 'x',
      'services/api/pom.xml': '<project/>',
      'services/api/target/api.jar': 'x',
      'services/api/src/main/java/com/acme/build/Builder.java': 'x',
      'services/api/src/main/java/com/acme/out/Out.java': 'x',
      'tools/out/notes.md': 'x',
      'src/dist/index.ts': 'x',
    });

    expect(folders(findings)).toEqual([
      'committed-build-output apps/site/.next|build-output at package.json',
      'committed-build-output coverage|build-output at package.json',
      'committed-build-output dist|build-output at package.json',
      'committed-build-output docs/storybook-static|build-output at package.json',
      'committed-build-output packages/web/build|build-output at packages/web/package.json',
      'committed-build-output services/api/target|build-output at services/api/pom.xml',
    ]);
    expect(findings[2]).toEqual({
      tool: 'repository-hygiene',
      rule: 'committed-build-output',
      path: 'package.json',
      identity: 'dist|build-output',
      message:
        'dist/ looks like build output tracked in git. If it holds sources or build scripts, add ' +
        '{"rule":"committed-build-output","paths":["dist/**"],"reason":"..."} to "exceptions" in ' +
        'nitpicker.config.json, or rename it. Otherwise untrack it with `git rm -r --cached dist`, add ' +
        '`dist/` to .gitignore, and let CI produce it.',
      classification: 'enforceable',
      exceptionPaths: ['dist', 'dist/'],
    });
  });

  it.each([['dist/**'], ['dist'], ['dist/'], ['**/dist/**']])(
    'lifts the folder finding with the exception path %s',
    (glob) => {
      const findings = check({ 'package.json': manifest({ name: 'app' }), 'dist/a.js': 'x' });

      expect(
        withoutExcepted(findings, [{ rule: 'committed-build-output', paths: [glob] }]),
      ).toEqual([]);
    },
  );

  it('anchors a folder with no manifest above it to the folder itself', () => {
    const findings = check({ 'site/.next/cache/data': 'x' });

    expect(folders(findings)).toEqual([
      'committed-build-output site/.next|build-output at site/.next/',
    ]);
  });

  it('leaves build, out, target and coverage folders that hold sources or that the manifest runs', () => {
    const findings = check({
      'package.json': manifest({
        name: 'app',
        scripts: { build: 'node build/build.js' },
        build: { directories: { buildResources: 'build' } },
      }),
      'build/build.js': 'x',
      'build/index.html': 'x',
      'build/icon.icns': 'x',
      'svc/pyproject.toml': '[project]\nname = "svc"\n',
      'svc/build/make_docs.py': 'x',
      'svc/coverage/__init__.py': 'x',
      'gradle/build.gradle.kts': 'plugins {}\n',
      'gradle/build/convention/Conventions.kt': 'x',
      'docs/package.json': manifest({ name: 'docs' }),
      'docs/build/guide.md': 'x',
      'docs/out/bundle.min.js': 'x',
      'docs/target/types.d.ts': 'x',
    });

    expect(folders(findings)).toEqual([
      'committed-build-output docs/out|build-output at docs/package.json',
      'committed-build-output docs/target|build-output at docs/package.json',
    ]);
  });

  it('leaves output that a GitHub Action or a package installed from git runs', () => {
    const findings = check({
      'action.yml':
        "name: act\nruns:\n  using: node20\n  main: 'dist/index.js'\n  post: dist/cleanup.js\n",
      'package.json': manifest({ name: 'act', private: true }),
      'dist/index.js': 'x',
      'lib/package.json': manifest({
        name: 'lib',
        exports: { '.': { import: './dist/index.mjs' } },
      }),
      'lib/dist/index.mjs': 'x',
      'built/package.json': manifest({
        name: 'built',
        main: 'dist/index.js',
        scripts: { prepare: 'tsc' },
      }),
      'built/dist/index.js': 'x',
      'web/package.json': manifest({ name: 'web', private: true, main: 'dist/main.js' }),
      'web/dist/main.js': 'x',
    });

    expect(folders(findings)).toEqual([
      'committed-build-output built/dist|build-output at built/package.json',
      'committed-build-output web/dist|build-output at web/package.json',
    ]);
  });
});
