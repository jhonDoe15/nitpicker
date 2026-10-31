import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../../core/diff/git/test-support/git-checkout.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import { finding, sourceRoots } from '../test-support/spring-config-projects.mjs';
import { readSpringConfigFindings } from '../java-spring.mjs';
import { springWiringProblems } from './spring-wiring.mjs';

const roots = [];
const { gitCheckout } = useGitCheckouts();

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sources(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-wiring-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const MAIN = 'src/main/java/demo';
const SCHEDULED = [
  'package demo;',
  'import org.springframework.scheduling.annotation.Scheduled;',
  'class Jobs {',
  '  @Scheduled(fixedDelay = 1000)',
  '  void run() {}',
  '}',
].join('\n');
const ENABLE = [
  'package demo;',
  'import org.springframework.scheduling.annotation.EnableScheduling;',
  '@EnableScheduling',
  'class Config {}',
].join('\n');

function problems(files) {
  return springWiringProblems(sources(files), sourceRoots);
}

describe('missing-enable', () => {
  it('reports a use of an annotation nobody enables', () => {
    expect(problems({ [`${MAIN}/Jobs.java`]: SCHEDULED })).toEqual([
      {
        path: `${MAIN}/Jobs.java`,
        line: 4,
        key: 'enable-scheduling',
        message:
          'Add @EnableScheduling to one @Configuration class; without it @Scheduled does nothing.',
      },
    ]);
  });

  it('reports every use in a file, not only the first', () => {
    const twice = SCHEDULED.replace(
      '  void run() {}',
      '  void run() {}\n  @Scheduled(fixedDelay = 5)\n  void other() {}',
    );

    expect(problems({ [`${MAIN}/Jobs.java`]: twice }).map(({ line }) => line)).toEqual([4, 6]);
  });

  it('scans Kotlin sources for uses and enabling annotations', () => {
    const kotlin = [
      'package demo',
      'import org.springframework.scheduling.annotation.Scheduled',
      'class Jobs {',
      '  @Scheduled(fixedDelay = 1000)',
      '  fun run() {}',
      '}',
    ].join('\n');
    const config =
      'package demo\nimport org.springframework.scheduling.annotation.EnableScheduling\n@EnableScheduling\nclass C';

    expect(
      springWiringProblems(sources({ 'src/main/kotlin/demo/Jobs.kt': kotlin }), [
        'src/main/kotlin',
      ]),
    ).toEqual([
      {
        path: 'src/main/kotlin/demo/Jobs.kt',
        line: 4,
        key: 'enable-scheduling',
        message:
          'Add @EnableScheduling to one @Configuration class; without it @Scheduled does nothing.',
      },
    ]);
    expect(
      springWiringProblems(
        sources({ 'src/main/kotlin/demo/Jobs.kt': kotlin, 'src/main/kotlin/demo/C.kt': config }),
        ['src/main/kotlin'],
      ),
    ).toEqual([]);
  });

  it('is satisfied by XML annotation-driven configuration in the resources', () => {
    const xml =
      '<beans xmlns:task="http://www.springframework.org/schema/task">\n  <task:annotation-driven/>\n</beans>';
    const root = sources({
      [`${MAIN}/Jobs.java`]: SCHEDULED,
      'src/main/resources/context.xml': xml,
    });

    expect(springWiringProblems(root, sourceRoots, ['src/main/resources'])).toEqual([]);
    expect(springWiringProblems(root, sourceRoots)).toHaveLength(1);
  });

  it('is satisfied by one enabling class anywhere in the main sources', () => {
    expect(problems({ [`${MAIN}/Jobs.java`]: SCHEDULED, [`${MAIN}/Config.java`]: ENABLE })).toEqual(
      [],
    );
  });

  it('accepts a fully qualified enabling annotation', () => {
    const config =
      'package demo;\n@org.springframework.scheduling.annotation.EnableScheduling\nclass C {}';

    expect(problems({ [`${MAIN}/Jobs.java`]: SCHEDULED, [`${MAIN}/C.java`]: config })).toEqual([]);
  });

  it('reports each file that uses the annotation, and each kind separately', () => {
    const async = [
      'package demo;',
      'import org.springframework.scheduling.annotation.*;',
      'class Mail {',
      '  @Async("pool") void send() {}',
      '  @Scheduled(cron = "0 0 * * * *") void nightly() {}',
      '}',
    ].join('\n');

    expect(
      problems({ [`${MAIN}/Jobs.java`]: SCHEDULED, [`${MAIN}/Mail.java`]: async }).map(
        ({ path: file, key, line }) => [file, key, line],
      ),
    ).toEqual([
      [`${MAIN}/Jobs.java`, 'enable-scheduling', 4],
      [`${MAIN}/Mail.java`, 'enable-scheduling', 5],
      [`${MAIN}/Mail.java`, 'enable-async', 4],
    ]);
  });

  it.each([
    [
      'org.springframework.cache.annotation.Cacheable',
      '@Cacheable("p")',
      'Cacheable',
      'EnableCaching',
    ],
    [
      'org.springframework.cache.annotation.CacheEvict',
      '@CacheEvict("p")',
      'CacheEvict',
      'EnableCaching',
    ],
    [
      'org.springframework.security.access.prepost.PreAuthorize',
      '@PreAuthorize("hasRole(\'A\')")',
      'PreAuthorize',
      'EnableMethodSecurity',
    ],
    ['org.springframework.retry.annotation.Retryable', '@Retryable', 'Retryable', 'EnableRetry'],
    ['org.springframework.scheduling.annotation.Async', '@Async', 'Async', 'EnableAsync'],
  ])('knows %s needs @%s', (type, use, annotation, enabler) => {
    const source = `package demo;\nimport ${type};\nclass S {\n  ${use}\n  void m() {}\n}`;

    expect(problems({ [`${MAIN}/S.java`]: source })).toEqual([
      {
        path: `${MAIN}/S.java`,
        line: 4,
        key: `enable-${enabler.slice('Enable'.length).toLowerCase()}`,
        message: `Add @${enabler} to one @Configuration class; without it @${annotation} does nothing.`,
      },
    ]);
  });

  it('ignores annotations of other libraries, comments, strings and test sources', () => {
    const other =
      'package demo;\nimport io.quarkus.scheduler.Scheduled;\nclass J {\n  @Scheduled(every = "1s") void run() {}\n}';
    const hidden =
      'package demo;\nimport org.springframework.scheduling.annotation.Scheduled;\nclass H {\n  // @Scheduled\n  String s = "@Scheduled";\n}';

    expect(
      problems({
        [`${MAIN}/J.java`]: other,
        [`${MAIN}/H.java`]: hidden,
        'src/test/java/demo/T.java': SCHEDULED,
      }),
    ).toEqual([]);
  });

  it('does not count an enabling annotation in a comment', () => {
    const config = 'package demo;\n// @EnableScheduling\nclass C {}';

    expect(problems({ [`${MAIN}/Jobs.java`]: SCHEDULED, [`${MAIN}/C.java`]: config })).toHaveLength(
      1,
    );
  });

  it('shapes the finding with the exception line and works without config files', () => {
    const root = sources({ [`${MAIN}/Jobs.java`]: SCHEDULED });

    expect(readSpringConfigFindings(root, { sourceRoots })).toEqual([
      finding({
        rule: 'missing-enable',
        file: `${MAIN}/Jobs.java`,
        identity: 'enable-scheduling',
        message:
          'Add @EnableScheduling to one @Configuration class; without it @Scheduled does nothing.',
        line: 4,
      }),
    ]);
  });
});

describe('springWiringProblems in a Git checkout', () => {
  it('reads the sources of the checkout, not ignored folders or nested checkouts', () => {
    const hidden = gitCheckout(
      {
        [`${MAIN}/Jobs.java`]: SCHEDULED,
        [`${MAIN}/gen/Config.java`]: ENABLE,
        ...nestedCheckout(`${MAIN}/agent`, { 'Config.java': ENABLE }),
      },
      [`${MAIN}/gen/`],
    );
    const enabled = gitCheckout({
      [`${MAIN}/Jobs.java`]: SCHEDULED,
      [`${MAIN}/Config.java`]: ENABLE,
    });

    expect(springWiringProblems(hidden, sourceRoots)).toHaveLength(1);
    expect(springWiringProblems(enabled, sourceRoots)).toEqual([]);
  });
});
