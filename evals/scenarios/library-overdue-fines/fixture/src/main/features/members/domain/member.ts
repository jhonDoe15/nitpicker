export type Tier = 'standard' | 'student';

export type Member = {
  readonly id: string;
  readonly name: string;
  readonly tier: Tier;
};

export function isStudent(member: Member): boolean {
  return member.tier === 'student';
}

export function describeMember(member: Member): string {
  return `${member.name} (${member.tier})`;
}
