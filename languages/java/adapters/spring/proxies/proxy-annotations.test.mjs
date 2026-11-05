import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectProxyAnnotations } from './proxy-annotations.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'proxy-annotations-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    const full = path.join(root, 'src/main/java', file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return projectProxyAnnotations(root);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('projectProxyAnnotations', () => {
  it('finds annotations meta-annotated with a proxied one, also through another project annotation', () => {
    expect(
      project({
        'shop/Audited.java': [
          'package shop;',
          'import org.springframework.transaction.annotation.Transactional;',
          '@Target({ElementType.METHOD, ElementType.TYPE})',
          '@Transactional(readOnly = true)',
          'public @interface Audited {}',
        ].join('\n'),
        'shop/Reported.java': 'package shop;\n@Audited\npublic @interface Reported {}\n',
        'shop/Retried.java': [
          'package shop;',
          'import org.springframework.cache.annotation.*;',
          '@Cacheable("rates") @interface Retried {}',
        ].join('\n'),
        'shop/Plain.java': [
          'package shop;',
          '// @Transactional',
          '@Documented',
          'public @interface Plain {}',
        ].join('\n'),
      }),
    ).toEqual({
      proxied: ['shop.Audited', 'shop.Reported', 'shop.Retried'],
      constraints: [],
    });
  });

  it('leaves out an annotation that only carries a Resilience4j or Micrometer one, which their aspects never see', () => {
    expect(
      project({
        'shop/Retried.java': [
          'package shop;',
          'import io.github.resilience4j.retry.annotation.Retry;',
          'import io.micrometer.core.annotation.Timed;',
          '@Retry(name = "remote") @Timed public @interface Retried {}',
        ].join('\n'),
      }).proxied,
    ).toEqual([]);
  });

  it('names an imported nested annotation by its binary name', () => {
    expect(
      project({
        'shop/marks/Outer.java': [
          'package shop.marks;',
          'public class Outer {',
          '  @org.springframework.scheduling.annotation.Async public @interface Later {}',
          '}',
        ].join('\n'),
        'shop/Soon.java': [
          'package shop;',
          'import shop.marks.Outer.Later;',
          '@Later public @interface Soon {}',
        ].join('\n'),
      }).proxied,
    ).toEqual(['shop.Soon', 'shop.marks.Outer$Later']);
  });

  it('names a nested annotation type by its binary name', () => {
    expect(
      project({
        'shop/Outer.java': [
          'package shop;',
          'public class Outer {',
          '  @org.springframework.scheduling.annotation.Async',
          '  public @interface Later {}',
          '}',
        ].join('\n'),
      }).proxied,
    ).toEqual(['shop.Outer$Later']);
  });

  it('finds the annotations an aspect names in @annotation, by type or through a bound parameter', () => {
    expect(
      project({
        'shop/Tracing.java': [
          'package shop;',
          'import org.aspectj.lang.annotation.Around;',
          'import org.aspectj.lang.annotation.Aspect;',
          'import org.aspectj.lang.annotation.Before;',
          'import org.aspectj.lang.annotation.Pointcut;',
          'import shop.marks.Traced;',
          '@Aspect',
          'class Tracing {',
          '  @Pointcut("@annotation(shop.marks.Timed)")',
          '  void timed() {}',
          '  @Around("@annotation(traced) && " + "within(shop..*)")',
          '  @Order(1)',
          '  public Object trace(ProceedingJoinPoint point, final Traced traced) throws Throwable {',
          '    return point.proceed();',
          '  }',
          '  @Before("@annotation(Logged)")',
          '  void log(JoinPoint point) {}',
          '}',
        ].join('\n'),
        'shop/NotAnAspect.java': [
          'package shop;',
          'import org.aspectj.lang.annotation.Around;',
          'class NotAnAspect {',
          '  @Around("@annotation(shop.Ignored)")',
          '  Object around() { return null; }',
          '}',
        ].join('\n'),
      }).proxied,
    ).toEqual(['shop.Logged', 'shop.marks.Timed', 'shop.marks.Traced']);
  });

  it('reads pointcuts from text blocks and string constants, past other strings', () => {
    expect(
      project({
        'shop/Timing.java': [
          'package shop;',
          'import org.aspectj.lang.annotation.*;',
          '@Aspect',
          'class Timing {',
          '  static final String LABEL = "🚀🚀 launch";',
          '  static final String WATCHED = "@annotation(shop.Watched)";',
          '  @Around(WATCHED)',
          '  Object watch() { return null; }',
          '  @Before("""',
          '      @annotation(shop.Marked)',
          '      """)',
          '  void mark() {}',
          '}',
        ].join('\n'),
      }).proxied,
    ).toEqual(['shop.Marked', 'shop.Watched']);
  });

  it('finds the constraint annotations the project declares, composed ones too', () => {
    expect(
      project({
        'shop/Sku.java': [
          'package shop;',
          'import jakarta.validation.Constraint;',
          '@Constraint(validatedBy = SkuValidator.class)',
          'public @interface Sku {}',
        ].join('\n'),
        'shop/Code.java': [
          'package shop;',
          'import jakarta.validation.constraints.NotBlank;',
          '@NotBlank @Sku',
          'public @interface Code {}',
        ].join('\n'),
      }),
    ).toEqual({ proxied: [], constraints: ['shop.Code', 'shop.Sku'] });
  });
});
