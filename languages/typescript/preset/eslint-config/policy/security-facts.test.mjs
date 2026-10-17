import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { productionPolicyConfigFor } from './production-policy.mjs';
import { securityFactsFor, securityRules } from './security-facts.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-security-facts-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}

const production = (file) => defaultResolvedLayout.isSourceFile(file);
const manifest = (dependencies) => ({ 'package.json': { dependencies } });

function securityRuleIds(filename, code, options = {}) {
  const config = productionPolicyConfigFor(defaultResolvedLayout, options);
  return lintFixture({ config, filename, code })
    .map((message) => message.ruleId)
    .filter((ruleId) => /tls|timeout|sql|hash|deserialization/u.test(ruleId ?? ''));
}

describe('security facts', () => {
  it.each(['vue', 'svelte', 'preact', 'solid-js', '@angular/core', 'react'])(
    'treats a %s project as browser code, so fetch needs no timeout',
    (name) => {
      const facts = securityFactsFor(projectWith(manifest({ [name]: '1.0.0' })), production);

      expect(facts.browser).toBe(true);
      expect(
        securityRules({ react: false, security: facts })['nitpicker/require-http-timeout'][1].fetch,
      ).toBe(false);
    },
  );

  it('checks fetch in a server project', () => {
    const facts = securityFactsFor(projectWith(manifest({ express: '4.0.0' })), production);

    expect(facts.browser).toBe(false);
    expect(
      securityRuleIds('src/x.ts', 'export const get = (u: string) => fetch(u);', {
        security: facts,
      }),
    ).toEqual(['nitpicker/require-http-timeout']);
  });

  it('reads the installed js-yaml and node-fetch majors and the tagged-template library', () => {
    const root = projectWith({
      ...manifest({ 'js-yaml': '^4.1.0', 'node-fetch': '^3.0.0', 'drizzle-orm': '0.30.0' }),
      'node_modules/js-yaml/package.json': { version: '3.14.1' },
    });

    const { yamlMajor, nodeFetchTimeout, sqlLibrary } = securityFactsFor(root, production);

    expect({ yamlMajor, nodeFetchTimeout, sqlLibrary }).toEqual({
      yamlMajor: 3,
      nodeFetchTimeout: false,
      sqlLibrary: 'drizzle-orm',
    });
  });

  it('accepts the node-fetch 2 timeout option', () => {
    const facts = securityFactsFor(projectWith(manifest({ 'node-fetch': '^2.6.7' })), production);

    expect(facts.nodeFetchTimeout).toBe(true);
  });

  it('finds a timeout set once for the whole project in a production module', () => {
    const root = projectWith({
      ...manifest({ axios: '1.0.0', undici: '6.0.0' }),
      'src/http-defaults.ts': 'import axios from "axios";\naxios.defaults.timeout = 10_000;\n',
      'src/dispatcher.ts':
        'import { Agent, setGlobalDispatcher } from "undici";\nsetGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }));\n',
    });

    expect(securityFactsFor(root, production).httpDefaults).toEqual(['axios', 'fetch']);
  });

  it('ignores a zero timeout, other objects and test files', () => {
    const root = projectWith({
      ...manifest({ axios: '1.0.0' }),
      'src/zero.ts': 'import axios from "axios";\naxios.defaults.timeout = 0;\n',
      'src/other.ts': 'import axios from "axios";\nsettings.defaults.timeout = 5;\n',
      'src/setup.test.ts': 'import axios from "axios";\naxios.defaults.timeout = 5;\n',
    });

    expect(securityFactsFor(root, production).httpDefaults).toEqual([]);
  });
});

describe('security rule scope', () => {
  const code =
    'import https from "node:https";\nexport const insecureAgent = new https.Agent({ rejectUnauthorized: false });\nexport const ping = (u: string) => fetch(u);\n';

  it.each([
    'src/test-support/tls-server.ts',
    'src/mocks/handlers.ts',
    'src/__fixtures__/agent.ts',
    'src/__mocks__/agent.ts',
    'src/components/Button.stories.ts',
    'src/setupTests.ts',
  ])('does not apply to the test support file %s', (file) => {
    expect(securityRuleIds(file, code)).toEqual([]);
  });

  it('applies to production code', () => {
    expect(securityRuleIds('src/feature/agent.ts', code)).toEqual([
      'nitpicker/no-disabled-tls-verification',
      'nitpicker/require-http-timeout',
    ]);
  });
});
