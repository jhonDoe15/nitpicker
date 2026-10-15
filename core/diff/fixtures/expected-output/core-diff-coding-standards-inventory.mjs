import { expect } from 'vitest';
export function expectedOutput32_25() {
  return [
    {
      file: 'src/main/legacy.ts',
      rule: 'nitpicker/preserve-error-cause',
      source: 'new Error(String(error))',
    },
  ];
}

export function expectedOutput66_40() {
  return [
    {
      tool: 'coding-standards',
      rule: 'nitpicker/preserve-error-cause',
      path: 'src/main/legacy.ts',
      identity: 'source:2b12a180517391cf91a57a1f|count:1',
      message: 'New coding-standard site: new Error(String(error))',
      classification: 'enforceable',
    },
  ];
}
