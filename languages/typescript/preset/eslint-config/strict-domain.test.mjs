import { describe, expect, it } from 'vitest';
import { lintFixture } from '../failure-messages/harness.mjs';
import { strictDomainConfig } from './strict-domain.mjs';

function messagesFor(filename, code) {
  return lintFixture({ config: strictDomainConfig, filename, code })
    .filter((m) => m.ruleId !== null)
    .map((m) => m.message);
}

const domainFile = 'src/main/features/billing/domain/invoice.ts';

describe('strict domain rules', () => {
  it('accept the allowed transforms and readonly data', () => {
    const code = `
type Line = { readonly price: number };
export function total(lines: readonly Line[]) {
  const prices = lines.map((line) => line.price).filter((price) => price > 0);
  const byPrice = Object.groupBy(prices, (price) => String(price));
  return Object.fromEntries(Object.entries(byPrice).flatMap(([key]) => [[key, 1]]));
}
`;
    expect(messagesFor(domainFile, code)).toEqual([]);
  });

  it('reports a mutation once, with the domain message', () => {
    expect(messagesFor(domainFile, 'export const run = (xs: number[]) => xs.push(1);')).toEqual(
      expect.arrayContaining([expect.stringContaining('domain/ code does not mutate arrays')]),
    );
    const assign = (target) =>
      `export const run = (o: { readonly a: number }) => Object.assign(${target}, o);`;
    expect(messagesFor(domainFile, assign('o'))).toEqual([
      expect.stringContaining('domain/ code does not mutate objects'),
    ]);
    expect(messagesFor(domainFile, assign('{}'))).toEqual([]);
  });

  it('reports a type predicate over unknown once, as an unknown parameter', () => {
    const code =
      "export function isRecord(value: unknown): value is Record<string, string> { return typeof value === 'object'; }";
    const ruleIds = lintFixture({ config: strictDomainConfig, filename: domainFile, code }).map(
      (m) => m.ruleId,
    );
    expect(ruleIds).toEqual(['nitpicker/no-unknown-in-domain']);
  });

  it('keeps react and other UI frameworks out of domain/', () => {
    const message =
      'domain/ does not import react, react-dom, react-native or preact: components and hooks live in adapters/ (or shared/ui) and call the logic in domain/. ' +
      'If a framework requires this file in domain/, add an exception for this rule for those paths in nitpicker.config.json.';
    const banned = [
      "import { useState } from 'react'; export const y = useState;",
      "import { createRoot } from 'react-dom/client'; export const y = createRoot;",
      "import { View } from 'react-native'; export const y = View;",
      "import { useState } from 'preact/hooks'; export const y = useState;",
      "import type { ReactNode } from 'react'; export type A = ReactNode;",
      "export const load = () => import('react');",
      "export { useState } from 'react';",
      "export * from 'react';",
      "const react = require('react'); export const y = react;",
      "import React = require('react'); export const y = React;",
    ];
    expect(banned.map((code) => messagesFor(domainFile, code))).toEqual(
      banned.map(() => [message]),
    );
    expect(
      messagesFor(domainFile, "import { x } from 'react-query-lite'; export const y = x;"),
    ).toEqual([]);
    expect(messagesFor('src/main/features/billing/adapters/view.ts', "import 'react';")).toEqual(
      [],
    );
  });

  it('does not apply outside domain/', () => {
    const code = 'let n = 1; for (const x of [1]) { n += x; } class A {}';
    expect(messagesFor('src/main/features/billing/adapters/db.ts', code)).toEqual([]);
    expect(messagesFor('src/main/shared/util.ts', code)).toEqual([]);
  });

  it('applies to nested domain files of every feature', () => {
    expect(messagesFor('src/main/features/other/domain/deep/x.ts', 'let n = 1;')).toHaveLength(1);
  });

  it('bans UI frameworks under a rule id of their own', () => {
    const ruleIds = lintFixture({
      config: strictDomainConfig,
      filename: domainFile,
      code: "import { useState } from 'react'; export const y = useState;",
    }).map(({ ruleId }) => ruleId);

    expect(ruleIds).toEqual(['nitpicker/no-ui-framework-in-domain']);
  });
});
