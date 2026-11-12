import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  createWorkspace,
  gate,
  goRepository,
  newFindings,
  newMessages,
  removeWorkspace,
} from './test-support/go-e2e-support.mjs';
import { BASE_FILES } from './test-support/go-fixtures.mjs';
import {
  LOOKUP,
  OWN_RULES,
  PROJECT_STATICCHECK,
  SKIP_S1003,
  STATUS,
  STOCK,
  STOCK_REFRESH,
  TOKEN,
} from './test-support/go-lint-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

describe.skipIf(!goE2eEnabled)('Go preset linters end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, BASE_FILES);
    commitBranch(project, 'lint', { 'shop/lookup.go': LOOKUP });
    commitBranch(project, 'gosec', { 'shop/token.go': TOKEN });
    commitBranch(project, 'own-rules', { 'shop/rules.go': OWN_RULES });
    commitBranch(project, 'catalog', {
      'shop/stock.go': STOCK,
      'shop/stock/stock.go': STOCK_REFRESH,
    });
    commitBranch(project, 'catalog-values', { 'shop/status.go': STATUS });
    commitBranch(project, 'conf-ignored', {
      'shop/lookup.go': LOOKUP,
      'staticcheck.conf': SKIP_S1003,
    });
    commitBranch(project, 'conf-opted-in', {
      'shop/lookup.go': LOOKUP,
      'staticcheck.conf': SKIP_S1003,
      'nitpicker.config.json': PROJECT_STATICCHECK,
    });
  });
  afterAll(() => {
    removeWorkspace(workspace);
  });

  it('fails staticcheck, errcheck, modernize and revive findings with the allowed form', () => {
    const result = gate(project, 'lint');
    expect(newFindings(result)).toEqual([
      'errcheck/unchecked shop/lookup.go',
      'modernize/any shop/lookup.go',
      'revive/enforce-map-style shop/lookup.go',
      'staticcheck/S1003 shop/lookup.go',
    ]);
    expect(newMessages(result)).toEqual([
      'unchecked error. Handle the error: return it (wrapped with `%w`), or join it into a named error result in a deferred call, `defer func() { err = errors.Join(err, file.Close()) }()`. Assign a type assertion to two values, `value, ok := x.(T)`. If this is intended, add {"rule":"errcheck/unchecked","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'interface{} can be replaced by any. `go fix ./...` applies this rewrite. If this is intended, add {"rule":"modernize/any","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'use map[type]type{} instead of make(map[type]type). Write `map[K]V{}`; keep `make` only with a size: `make(map[K]V, n)`. If this is intended, add {"rule":"revive/enforce-map-style","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'should use strings.Contains(name, "-") instead. If this is intended, add {"rule":"staticcheck/S1003","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('fails gosec findings with the safe form, whatever #nosec says', () => {
    const result = gate(project, 'gosec');
    expect(newFindings(result)).toEqual(['gosec/G404 shop/token.go']);
    expect(newMessages(result)).toEqual([
      'Use of weak random number generator (math/rand or math/rand/v2 instead of crypto/rand). Use crypto/rand (`rand.Text()`, `rand.Read`) for anything an attacker must not guess. For simulations, jitter or sampling, add an exception for this rule with the reason. If this is intended, add {"rule":"gosec/G404","paths":["shop/token.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('fails the own go-rules findings with the allowed form', () => {
    const result = gate(project, 'own-rules');
    expect(newFindings(result)).toEqual([
      'go-rules/logged-and-returned shop/rules.go',
      'go-rules/panic-for-failure shop/rules.go',
    ]);
    expect(newMessages(result)).toEqual([
      'the error is logged and then returned, so it is reported twice: return it wrapped with `%w` and let the caller that handles it log it, or log it here and handle it. If this is intended, add {"rule":"go-rules/logged-and-returned","paths":["shop/rules.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'panic outside main, init and a Must function: return an error and let the caller decide (a Must function, such as `regexp.MustCompile`, panics only on input the program itself wrote). If this is intended, add {"rule":"go-rules/panic-for-failure","paths":["shop/rules.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('fails catalog linter findings, across packages of the module', () => {
    const result = gate(project, 'catalog');
    expect(newFindings(result)).toEqual([
      'contextcheck/contextcheck shop/stock.go',
      'errorlint/errorlint shop/stock.go',
      'go-rules/context-outside-entry shop/stock/stock.go',
      'nilerr/nilerr shop/stock.go',
    ]);
    expect(newMessages(result)).toEqual([
      'Function `Refresh` should pass the context parameter. Take a `ctx context.Context` parameter and pass the caller\'s context down, or derive one from it; a goroutine uses a context made before the `go` statement. If this is intended, add {"rule":"contextcheck/contextcheck","paths":["shop/stock.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'comparing with == will fail on wrapped errors. Use errors.Is to check for a specific error. If this is intended, add {"rule":"errorlint/errorlint","paths":["shop/stock.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'a new root context outside package main cannot be cancelled by any caller: take `ctx context.Context` as the first parameter and pass it on. If this is intended, add {"rule":"go-rules/context-outside-entry","paths":["shop/stock/stock.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'error is not nil but it returns nil. Return the error the branch checks: the error when it is set, nil when it is not. If this is intended, add {"rule":"nilerr/nilerr","paths":["shop/stock.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('fails a switch that misses an enum constant', () => {
    const result = gate(project, 'catalog-values');
    expect(newFindings(result)).toEqual(['exhaustive/exhaustive shop/status.go']);
    expect(newMessages(result)).toEqual([
      'missing cases in expression switch. Add a case for each missing constant, or a `default` case that handles the rest. If this is intended, add {"rule":"exhaustive/exhaustive","paths":["shop/status.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('ignores a staticcheck.conf the project did not opt into', () => {
    expect(newFindings(gate(project, 'conf-ignored'))).toEqual([
      'errcheck/unchecked shop/lookup.go',
      'modernize/any shop/lookup.go',
      'revive/enforce-map-style shop/lookup.go',
      'staticcheck/S1003 shop/lookup.go',
    ]);
  });

  it('reads staticcheck.conf once the project opts in, as a policy change', () => {
    const result = gate(project, 'conf-opted-in');
    expect(newFindings(result)).toEqual([
      'errcheck/unchecked shop/lookup.go',
      'modernize/any shop/lookup.go',
      'nitpicker-config/policy-loosened nitpicker.config.json',
      'nitpicker-config/policy-loosened nitpicker.config.json',
      'revive/enforce-map-style shop/lookup.go',
    ]);
    expect(
      newMessages(result)
        .filter((message) => message.includes('staticcheck'))
        .map((message) => message.split('. ')[0]),
    ).toEqual([
      'staticcheck project config changed: staticcheck.conf',
      'tools.staticcheck.precedence: not set -> ["project"]',
    ]);
  });
});
