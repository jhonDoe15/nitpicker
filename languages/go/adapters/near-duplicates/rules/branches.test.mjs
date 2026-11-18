import { beforeAll, describe, expect, it } from 'vitest';
import { duplicateBranchFindings } from '../../../../../shared/rules/branches/duplicate-branches.mjs';
import { goParser, inPackage } from '../test-support/parse-go.mjs';

let parse;

beforeAll(async () => {
  parse = await goParser();
});

function branches(...lines) {
  return duplicateBranchFindings(parse(inPackage(...lines)), {
    analyzerName: 'facts',
    isExcepted: () => false,
  }).map(({ location, message }) => `${String(location.line)}: ${message.split('. ')[0]}`);
}

describe('duplicate-branch on Go', () => {
  it('leaves two arms of an if / else if chain with the same body to revive identical-ifelseif-branches', () => {
    expect(
      branches(
        'func pick(a, b int) {',
        '\tif a > 1 {',
        '\t\tlog(a)',
        '\t\tlog(2)',
        '\t} else if b > 1 {',
        '\t\tlog(a)',
        '\t\tlog(2)',
        '\t} else {',
        '\t\tlog(3)',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });

  it('leaves the two-arm if and else to revive identical-branches', () => {
    expect(
      branches(
        'func pick(a int) {',
        '\tif a > 0 {',
        '\t\tlog(a)',
        '\t\tlog(2)',
        '\t} else {',
        '\t\tlog(a)',
        '\t\tlog(2)',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });

  it('leaves switch cases with the same body to revive identical-switch-branches', () => {
    expect(
      branches(
        'func pick(a, b int) {',
        '\tswitch a {',
        '\tcase 1:',
        '\t\tlog(a)',
        '\t\tlog(b)',
        '\tcase 2:',
        '\t\tlog(a)',
        '\t\tlog(b)',
        '\tcase 3:',
        '\t\tlog(a)',
        '\t\tfallthrough',
        '\tcase 4:',
        '\t\tlog(a)',
        '\t\tlog(b)',
        '\tdefault:',
        '\t\tlog(9)',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });

  it('compares nothing in a switch where every case falls into the next', () => {
    expect(
      branches(
        'func pick(a int) {',
        '\tswitch a {',
        '\tcase 1:',
        '\t\tlog(a)',
        '\t\tlog(2)',
        '\t\tfallthrough',
        '\tcase 2:',
        '\t\tlog(a)',
        '\t\tlog(2)',
        '\t\tfallthrough',
        '\tcase 3:',
        '\t\tlog(3)',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });

  it('leaves the cases of a switch without a tag to revive identical-switch-branches', () => {
    expect(
      branches(
        'func pick(a, b int) {',
        '\tswitch {',
        '\tcase a == 1:',
        '\t\tlog(a)',
        '\t\tlog(b)',
        '\tcase b == 1:',
        '\t\tlog(a)',
        '\t\tlog(b)',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });

  it('reports select cases with the same body and names the select', () => {
    expect(
      branches(
        'func wait(x, y chan int) {',
        '\tselect {',
        '\tcase <-x:',
        '\t\tlog(1)',
        '\t\tlog(2)',
        '\tcase <-y:',
        '\t\tlog(1)',
        '\t\tlog(2)',
        '\tdefault:',
        '\t\tlog(3)',
        '\t}',
        '}',
      ),
    ).toEqual(['8: The cases on lines 5 and 8 of the select have the same body']);
  });

  it('does not compare the cases of a type switch', () => {
    expect(
      branches(
        'func kind(v any) {',
        '\tswitch t := v.(type) {',
        '\tcase int:',
        '\t\tlog(t)',
        '\t\tlog(2)',
        '\tcase string:',
        '\t\tlog(t)',
        '\t\tlog(2)',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });

  it('does not suggest moving a statement out of a select or a switch with a break', () => {
    expect(
      branches(
        'func wait(x, y chan int, a int) {',
        '\tselect {',
        '\tcase <-x:',
        '\t\tstart()',
        '\t\tone()',
        '\tcase <-y:',
        '\t\tstart()',
        '\t\ttwo()',
        '\tdefault:',
        '\t\tstart()',
        '\t\tthree()',
        '\t}',
        '\tswitch {',
        '\tcase a > 1:',
        '\t\tone()',
        '\t\tbreak',
        '\tdefault:',
        '\t\ttwo()',
        '\t\tbreak',
        '\t}',
        '}',
      ),
    ).toEqual([]);
  });
});
