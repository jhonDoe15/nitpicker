import { describe, expect, it } from 'vitest';
import { withPmdAdvice } from './pmd-advice.mjs';

const finding = (rule, message, tool = 'pmd') => ({
  tool,
  rule,
  path: 'src/main/java/A.java',
  identity: 'id',
  message,
  classification: 'enforceable',
});

describe('withPmdAdvice', () => {
  it('adds the allowed form and the exception route to a stock PMD message', () => {
    expect(
      withPmdAdvice(
        finding(
          'StringToString',
          'Avoid calling toString() on String objects; this is unnecessary.',
        ),
      ),
    ).toEqual(
      finding(
        'StringToString',
        'Avoid calling toString() on String objects; this is unnecessary. Remove the toString() call. ' +
          'If it is right here, add an exception for pmd/StringToString in nitpicker.config.json.',
      ),
    );
  });

  it('adds only the exception route when there is no allowed form to name', () => {
    expect(
      withPmdAdvice(
        finding('DontCallThreadRun', "Don't call Thread.run() explicitly, use Thread.start()"),
      ),
    ).toEqual(
      finding(
        'DontCallThreadRun',
        "Don't call Thread.run() explicitly, use Thread.start(). " +
          'If it is right here, add an exception for pmd/DontCallThreadRun in nitpicker.config.json.',
      ),
    );
  });

  it('leaves a message that names its route, and other tools, alone', () => {
    const named = finding(
      'OptionalGet',
      'Use orElseThrow(). Add an exception in nitpicker.config.json.',
    );
    const spotbugs = finding('DLS_DEAD_LOCAL_STORE', 'Dead store', 'spotbugs');

    expect(withPmdAdvice(named)).toBe(named);
    expect(withPmdAdvice(spotbugs)).toBe(spotbugs);
  });
});
