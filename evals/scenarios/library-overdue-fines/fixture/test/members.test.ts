import { describe, expect, it } from 'vitest';
import {
  createInMemoryMembers,
  describeMember,
  isStudent,
} from '../src/main/features/members/index.js';
import type { Member } from '../src/main/features/members/index.js';

const ada: Member = { id: 'M1', name: 'Ada Lovelace', tier: 'standard' };
const grace: Member = { id: 'M2', name: 'Grace Hopper', tier: 'student' };

describe('members', () => {
  it('recognises students', () => {
    expect(isStudent(grace)).toBe(true);
    expect(isStudent(ada)).toBe(false);
  });

  it('describes a member with the tier', () => {
    expect(describeMember(grace)).toBe('Grace Hopper (student)');
  });

  it('finds members by id', () => {
    const directory = createInMemoryMembers([ada, grace]);
    expect(directory.find('M2')).toEqual(grace);
    expect(directory.find('M3')).toBeUndefined();
    expect(directory.all()).toEqual([ada, grace]);
  });
});
