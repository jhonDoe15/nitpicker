import type { Member } from '../domain/member.js';

export type Directory = {
  readonly find: (id: string) => Member | undefined;
  readonly all: () => readonly Member[];
};

export function createInMemoryMembers(members: readonly Member[]): Directory {
  function find(id: string): Member | undefined {
    return members.find((member) => member.id === id);
  }

  function all(): readonly Member[] {
    return members;
  }

  return { find, all };
}
