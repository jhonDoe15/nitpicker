import { expect } from 'vitest';
export function expectedOutput31_33() {
  return 'Calc::classify( int a , int b , String s) has CRAP 71.39; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.';
}

export function expectedOutput41_49() {
  return [
    'Calc::Calc::anon.run()',
    'Calc::Inner::get( int a)',
    'Calc::classify( int a , int b , String s)',
  ];
}

export function expectedOutput94_31() {
  return {
    key: 'function:Calc::classify( int a , int b , String s):crap',
    value: expect.any(Number),
    worseMessage:
      'Calc::classify( int a , int b , String s) CRAP rose from {base} to 71.39 (limit 9). Put new code in a new function and cover it with tests.',
    heldMessage:
      'Calc::classify( int a , int b , String s): CRAP 71.39 (limit 9), allowed because base was {base}; any increase fails.',
  };
}
