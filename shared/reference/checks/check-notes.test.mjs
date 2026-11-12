import { describe, expect, it } from 'vitest';
import { RULES } from '../../policy.mjs';
import { QUALITY_NOTES } from './quality-notes.mjs';
import { SIZE_NOTES } from './size-notes.mjs';
import { STRUCTURE_NOTES } from './structure-notes.mjs';

describe('the texts the rule reference writes for the shared checks', () => {
  it('name only rules of the shared check catalog', () => {
    const ids = new Set(RULES.map(({ id }) => id));
    const notes = [SIZE_NOTES, QUALITY_NOTES, STRUCTURE_NOTES].flatMap(Object.keys);

    expect(notes.filter((id) => !ids.has(id))).toEqual([]);
  });
});
