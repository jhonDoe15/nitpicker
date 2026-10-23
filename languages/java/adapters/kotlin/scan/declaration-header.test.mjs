import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withFrameworkAllowances } from './framework-allowances.mjs';
import { scanKotlinSource } from './kotlin-source.mjs';
import { hasCallbackAnnotation } from './declaration-header.mjs';

function skipped(source, line) {
  return hasCallbackAnnotation(scanKotlinSource(source), line);
}

describe('hasCallbackAnnotation', () => {
  it.each([
    ['@Inject', '@Inject\nfun wire(name: String) {}'],
    ['@PostConstruct', '@PostConstruct\nfun start(context: Context) {}'],
    ['@Transactional with arguments', '@Transactional(readOnly = true)\nfun load(id: Long) = 1'],
    ['@Composable', '@Composable\nfun Screen(title: String) {}'],
    ['a qualified annotation', '@org.junit.Test\nfun runs(extra: Int) {}'],
    ['a use-site annotation', '@get:Bean\nfun make(name: String) = 1'],
    ['an annotation beside modifiers', '@Bean\nprivate suspend fun make(name: String) = 1'],
    ['an annotation on the same line', '@EventListener fun on(event: Event) {}'],
    [
      'a deprecated and a framework annotation',
      '@Deprecated("x")\n@Scheduled\nfun tick(now: Long) {}',
    ],
  ])('skips a function with %s', (_name, body) => {
    expect(skipped(`package demo\n\n${body}\n`, body.split('\n').length + 2)).toBe(true);
  });

  it.each([
    ['no annotation', 'fun total(count: Int, extra: Int): Int = count'],
    ['@Deprecated', '@Deprecated("x")\nfun total(count: Int, extra: Int): Int = count'],
    ['@Suppress', '@Suppress("MagicNumber")\nfun total(count: Int, extra: Int): Int = count'],
    ['@Throws', '@Throws(IOException::class)\nfun total(count: Int, extra: Int): Int = count'],
    ['@JvmStatic', '@JvmStatic\nfun total(count: Int, extra: Int): Int = count'],
    ['@JvmOverloads', '@JvmOverloads\nfun total(count: Int, extra: Int = 1): Int = count'],
    ['@JvmName', '@JvmName("sum")\nfun total(count: Int, extra: Int): Int = count'],
  ])('keeps a function with %s', (_name, body) => {
    expect(skipped(`package demo\n\n${body}\n`, body.split('\n').length + 2)).toBe(false);
  });

  it('reads the annotations of the function that owns the line, not a neighbour', () => {
    const source =
      'package demo\n\n@Inject\nfun wire(name: String) {}\n\nfun plain(count: Int, extra: Int) = count\n';

    expect(skipped(source, 4)).toBe(true);
    expect(skipped(source, 6)).toBe(false);
  });

  it('does not take an annotation of the enclosing class for the function', () => {
    const source = '@Service\nclass Shop {\n    fun total(count: Int, extra: Int) = count\n}\n';

    expect(skipped(source, 3)).toBe(false);
  });

  it('finds a parameter on a continuation line of a multi-line signature', () => {
    const source = '@Bean\nfun make(\n    name: String,\n    extra: Int,\n) = name\n';

    expect(skipped(source, 4)).toBe(true);
  });
});

describe('the unused-parameter finding in the framework allowances', () => {
  const finding = (file, line, rule = 'detekt.style.UnusedParameter') => ({
    tool: 'detekt',
    rule,
    path: file,
    message: 'Function parameter `extra` is unused.',
    location: { line },
  });
  const project = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-annotations-'));
    mkdirSync(path.join(root, 'src/main/kotlin'), { recursive: true });
    mkdirSync(path.join(root, 'src/test/kotlin'), { recursive: true });
    const source = '@Inject\nfun wire(extra: Int) {}\n\n@Deprecated("x")\nfun old(extra: Int) {}\n';
    writeFileSync(path.join(root, 'src/main/kotlin/Shop.kt'), source);
    writeFileSync(path.join(root, 'src/test/kotlin/ShopTest.kt'), source);
    return root;
  };

  it('drops the finding on an annotated function and keeps it on a deprecated one', () => {
    const root = project();
    const file = 'src/main/kotlin/Shop.kt';
    const kept = withFrameworkAllowances([finding(file, 2), finding(file, 5)], {
      projectRoot: root,
    });

    rmSync(root, { recursive: true, force: true });
    expect(kept.map(({ location }) => location.line)).toEqual([5]);
  });

  it('keeps the finding of another rule on an annotated function', () => {
    const root = project();
    const other = finding('src/main/kotlin/Shop.kt', 2, 'detekt.style.MagicNumber');
    const kept = withFrameworkAllowances([other], { projectRoot: root });

    rmSync(root, { recursive: true, force: true });
    expect(kept).toEqual([other]);
  });

  it('counts the rule in main sources only', () => {
    const root = project();
    const findings = [
      finding('src/test/kotlin/ShopTest.kt', 5),
      finding('src/main/kotlin/Shop.kt', 5),
    ];
    const kept = withFrameworkAllowances(findings, {
      projectRoot: root,
      testRoots: ['src/test/kotlin'],
    });

    rmSync(root, { recursive: true, force: true });
    expect(kept).toEqual(findings.slice(1));
  });
});
