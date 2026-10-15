import { expect } from 'vitest';
export function expectedOutput119_33() {
  return 'Line is longer than 100 characters <found 120>.';
}

export function expectedOutput171_33() {
  return 'ArchUnit rule services_do_not_use_dao violated by demo.service.OrderService (3 violations): Constructor <demo.service.OrderService.<init>(demo.dao.OrderDao)> has parameter of type <demo.dao.OrderDao>';
}

export function expectedOutput203_34() {
  return 'demo.Greeter|shout(Ljava/lang/String;)Ljava/lang/String;|EmptyObjectReturnValsMutator|replaced return value with "" for demo/Greeter::shout#1';
}

export function expectedOutput242_25() {
  return {
    tool: 'lcov',
    rule: 'line-coverage',
    path: 'src/util.js',
    identity: 'line-coverage',
    message: 'line-coverage 50% (2/4)',
    classification: 'descriptive',
    metric: { name: 'line-coverage', value: 50 },
  };
}

export function expectedOutput248_25() {
  return {
    tool: 'lcov',
    rule: 'uncovered-function',
    path: 'src/util.js',
    identity: 'cov:be6189c130cf22b5',
    message: 'Function format is not covered',
    classification: 'descriptive',
    symbol: 'format',
  };
}

export function expectedOutput254_25() {
  return {
    tool: 'jacoco',
    rule: 'line-coverage',
    path: 'src/main/java/com/acme/Foo.java',
    identity: 'line-coverage',
    message: 'line-coverage 60% (3/5)',
    classification: 'descriptive',
    metric: { name: 'line-coverage', value: 60 },
  };
}

export function expectedOutput258_25() {
  return {
    tool: 'jacoco',
    rule: 'uncovered-method',
    path: 'src/main/java/com/acme/Foo.java',
    identity: 'cov:2296ffd6e33a5f79',
    message: 'Method com.acme.Foo#unused(I)I is not covered',
    classification: 'descriptive',
    symbol: 'com.acme.Foo#unused(I)I',
  };
}
