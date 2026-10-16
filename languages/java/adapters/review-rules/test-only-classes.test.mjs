import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTestOnlyClassFindings } from './test-only-classes.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

const edge = ([source, target]) => `   ${source} -> ${target} not found\n`;

function module(root, qualifier, { classes, main = [], tests = [], published = false }) {
  const reportRoot = path.join(root, '.reports', qualifier || 'root');
  write(reportRoot, {
    'jdeps-classes.txt': classes.map((name) => `${name}\n`).join(''),
    'jdeps.txt': main.map(edge).join(''),
    'jdeps-test.txt': tests.map(edge).join(''),
    'manifest.json': JSON.stringify({ published }),
  });
  const prefix = qualifier === '' ? '' : `${qualifier}/`;
  return { reportRoot, qualifier, sourceRoots: [`${prefix}src/main/java`] };
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'test-only-classes-'));
  roots.push(root);
  write(root, files);
  return root;
}

const source = (name, body = '') => `package shop;\n\npublic class ${name} {${body}}\n`;

function summary(findings) {
  return findings.map(
    ({ path: file, identity, location }) => `${file}:${location?.line} ${identity}`,
  );
}

describe('readTestOnlyClassFindings', () => {
  it('reports a main class only test classes use, with the exception that lifts it', () => {
    const root = project({
      'src/main/java/shop/Cart.java': source('Cart'),
      'src/main/java/shop/Prices.java': source('Prices'),
      'src/main/java/shop/Fixtures.java': source('Fixtures'),
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, '', {
          classes: ['shop.Cart', 'shop.Prices', 'shop.Fixtures', 'shop.Fixtures$Order'],
          main: [
            ['shop.Cart', 'shop.Prices'],
            ['shop.Prices', 'shop.Cart'],
          ],
          tests: [
            ['shop.CartTest', 'shop.Cart'],
            ['shop.CartTest', 'shop.Fixtures$Order'],
          ],
        }),
      ],
    });

    expect(summary(findings)).toEqual(['src/main/java/shop/Fixtures.java:3 class:shop.Fixtures']);
    expect(findings[0].message).toBe(
      'Class shop.Fixtures is only used by tests. Move it to the test sources, or use it from production code. ' +
        'If this is intended, add {"rule":"coupling/test-only-export","paths":["src/main/java/shop/Fixtures.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('counts production use from another module and resolves a class to its own module first', () => {
    const root = project({
      'core/src/main/java/shop/Money.java': source('Money'),
      'app/src/main/java/shop/Money.java': source('Money'),
      'app/src/main/java/shop/App.java': source('App'),
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, 'core', {
          classes: ['shop.Money'],
          tests: [['shop.MoneyTest', 'shop.Money']],
        }),
        module(root, 'app', {
          classes: ['shop.Money', 'shop.App'],
          main: [['shop.App', 'shop.Money']],
          tests: [['shop.AppTest', 'shop.Money']],
        }),
      ],
    });

    expect(summary(findings)).toEqual(['core/src/main/java/shop/Money.java:3 class:shop.Money']);
  });

  it('spares container-wired classes, entry points and names production text mentions', () => {
    const root = project({
      'src/main/java/shop/Handler.java': source('Handler'),
      'src/main/java/shop/Main.java': source('Main', ' public static void main(String[] args) {} '),
      'src/main/java/shop/Limits.java': source('Limits', ' static final int MAX = 3; '),
      'src/main/java/shop/Cart.java': source('Cart', ' int max() { return Limits.MAX; } '),
      'src/main/java/shop/Appender.java': source('Appender'),
      'src/main/resources/logback.xml': '<appender class="shop.Appender"/>',
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, '', {
          classes: ['shop.Handler', 'shop.Main', 'shop.Limits', 'shop.Cart', 'shop.Appender'],
          main: [['shop.Handler', 'org.springframework.stereotype.Component']],
          tests: ['Handler', 'Main', 'Limits', 'Appender'].map((name) => [
            `shop.${name}Test`,
            `shop.${name}`,
          ]),
        }),
      ],
    });

    expect(findings).toEqual([]);
  });

  it("counts a published module's own tests as callers, but not other modules' tests", () => {
    const root = project({
      'lib/src/main/java/shop/Codec.java': source('Codec'),
      'lib/src/main/java/shop/Format.java': source('Format'),
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, 'lib', {
          classes: ['shop.Codec', 'shop.Format'],
          tests: [['shop.CodecTest', 'shop.Codec']],
          published: true,
        }),
        module(root, 'app', { classes: [], tests: [['shop.FormatTest', 'shop.Format']] }),
      ],
    });

    expect(summary(findings)).toEqual(['lib/src/main/java/shop/Format.java:3 class:shop.Format']);
  });

  it('stays silent when a module has no test dependency report', () => {
    const root = project({ 'src/main/java/shop/Cart.java': source('Cart') });
    const complete = module(root, '', { classes: ['shop.Cart'], tests: [['T', 'shop.Cart']] });
    rmSync(path.join(complete.reportRoot, 'jdeps-test.txt'));

    expect(readTestOnlyClassFindings(root, { projects: [complete] })).toEqual([]);
  });
});
