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
} from './test-support/go-lint-fixtures.mjs';

const goE2eEnabled = process.env.NITPICKER_GO_E2E === '1';

describe.skipIf(!goE2eEnabled)('Go preset linters end to end', () => {
  let workspace;
  let project;
  beforeAll(() => {
    workspace = createWorkspace();
    project = goRepository(workspace, BASE_FILES);
    commitBranch(project, 'lint', { 'shop/lookup.go': LOOKUP });
    commitBranch(project, 'own-rules', { 'shop/rules.go': OWN_RULES });
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

  it('fails staticcheck, errcheck and modernize findings with the allowed form', () => {
    const result = gate(project, 'lint');
    expect(newFindings(result)).toEqual([
      'errcheck/unchecked shop/lookup.go',
      'modernize/any shop/lookup.go',
      'staticcheck/S1003 shop/lookup.go',
    ]);
    expect(newMessages(result)).toEqual([
      'unchecked error. Handle the error: return it (wrapped with `%w`), or join it into a named error result in a deferred call, `defer func() { err = errors.Join(err, file.Close()) }()`. Assign a type assertion to two values, `value, ok := x.(T)`. If this is intended, add {"rule":"errcheck/unchecked","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'interface{} can be replaced by any. `go fix ./...` applies this rewrite. If this is intended, add {"rule":"modernize/any","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'should use strings.Contains(name, "-") instead. If this is intended, add {"rule":"staticcheck/S1003","paths":["shop/lookup.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
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

  it('ignores a staticcheck.conf the project did not opt into', () => {
    expect(newFindings(gate(project, 'conf-ignored'))).toEqual([
      'errcheck/unchecked shop/lookup.go',
      'modernize/any shop/lookup.go',
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
