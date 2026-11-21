import { describe, expect, it } from 'vitest';
import { isNonProductionPath, placeholderPhrase } from './placeholder-comments.mts';

describe('placeholderPhrase', () => {
  it.each([
    [' In a real implementation, this would call the rates API', 'In a real implementation'],
    [' in a real-world app we would page', undefined],
    [' In a real   world\n scenario you fetch the rates', 'In a real world'],
    [' Simulate API call', 'Simulate API'],
    [' simulating an HTTP round trip', 'simulating an HTTP'],
    [' Simulates the network delay', 'Simulates the network'],
    [' simulate a request', 'simulate a request'],
    [' Simulate latency', 'Simulate latency'],
    [' Mock data for now', 'Mock data for now'],
    [' mock response for now, wire the client later', 'mock response for now'],
    [' Placeholder implementation', 'Placeholder implementation'],
    [' TODO: replace with actual email service', 'replace with actual'],
    [' Replace this with a real check', 'Replace this with a real'],
    [' replace it with your real key lookup', 'replace it with your real'],
    [' For now, we just return a dummy user', 'For now, we just return a dummy'],
    [' for now returns hardcoded rates', 'for now returns hardcoded'],
  ])('reads %j as %j', (text, phrase) => {
    expect(placeholderPhrase(text)).toBe(phrase);
  });

  it.each([
    ' In a real browser the event fires twice',
    ' Keep the old path for now',
    ' For now return early when the list is empty',
    ' Mock data',
    ' Simulate loading delay for better UX',
    ' simulated annealing step',
    ' Simulate a click on the first tab',
    ' The placeholder text of the input',
    ' Replace the token with the value',
    ' unreal application of the rule',
  ])('leaves %j alone', (text) => {
    expect(placeholderPhrase(text)).toBeUndefined();
  });
});

describe('isNonProductionPath', () => {
  it.each([
    'src/rates/rates.test.ts',
    'src/rates/rates.spec.tsx',
    'src/__tests__/rates.ts',
    'src/test/java/org/acme/RatesTest.java',
    'examples/rates/index.ts',
    'src/components/Rates.stories.tsx',
    'src/__mocks__/client.ts',
    'src/mocks/handlers.ts',
    'prisma/seed.ts',
    'db/seeds/users.ts',
    'docs/snippets/rates.ts',
    'templates/app/route.ts',
    'packages/demo/src/main.ts',
    'e2e/rates.ts',
    'src\\fixtures\\rates.ts',
  ])('skips %s', (file) => {
    expect(isNonProductionPath(file)).toBe(true);
  });

  it.each([
    'src/rates/rates.ts',
    'src/latest/contest.ts',
    'src/main/java/org/acme/Rates.java',
    'src/documents/store.ts',
    'src/seeding.ts',
    'src/attestation/verify.ts',
  ])('keeps %s', (file) => {
    expect(isNonProductionPath(file)).toBe(false);
  });
});
