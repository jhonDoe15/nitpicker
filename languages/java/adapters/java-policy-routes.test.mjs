import { describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../shared/findings/finding-policy.mjs';
import { javaRouteRule } from './java-policy.mjs';

const finding = (tool, file) => ({
  tool,
  rule: 'Rule',
  path: file,
  identity: 'id',
  message: 'Rule violated.',
  classification: 'enforceable',
});

describe('exception routes of the Java route rule', () => {
  it('names an ArchUnit finding as <tool>/<rule> and leaves a PMD finding to the rule catalog', () => {
    const archunit = finding('archunit', 'src/main/java/app/A.java');
    const pmd = finding('pmd', 'src/main/java/app/B.java');

    expect(applyFindingPolicy([archunit, pmd], { routeRule: javaRouteRule })).toEqual([
      {
        ...archunit,
        message:
          'Rule violated. If this is intended, add {"rule":"archunit/Rule","paths":["src/main/java/app/A.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      },
      pmd,
    ]);
  });

  it('adds no route to a finding that an exception lifts', () => {
    const archunit = finding('archunit', 'src/main/java/app/A.java');

    expect(
      applyFindingPolicy([archunit], {
        routeRule: javaRouteRule,
        exceptions: [{ rule: 'archunit/Rule', paths: ['src/main/java/app/**'] }],
      }),
    ).toEqual([]);
  });

  it('keeps the one entry of a Spring architecture finding whose message names it', () => {
    const named = {
      ...finding('archunit', 'src/main/java/app/mapper/OwnerMapper.java'),
      rule: 'spring-layout',
      message:
        'Put OwnerMapper in the feature package it belongs to. If this is intended, add {"rule":"archunit/spring-layout","paths":["src/main/java/app/mapper/OwnerMapper.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    };

    expect(applyFindingPolicy([named], { routeRule: javaRouteRule })).toEqual([named]);
  });
});
