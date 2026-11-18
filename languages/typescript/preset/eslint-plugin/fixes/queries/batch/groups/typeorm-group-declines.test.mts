import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { typeormCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, declines } = typeormCases(ormProject('typeorm-group-declines'));

project.tester.run('typeorm lists that stay as they are', ioInLoop, {
  valid: [],
  invalid: [
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    out.push(members);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    out.push(members.length);
    for (const member of members) {
      use(member.name);
    }
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    return members.length;
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    members.sort((left, right) => left.id - right.id);
    out.push(members);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    members.push(members[0]);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    use(members);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, take: 5 });
    out.push(members.length);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, skip: 1 });
    out.push(members.length);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, select: ['name'] });
    out.push(members.length);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    members[0]!.name = 'x';
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    for (const member of members) {
      member.status = 'x';
    }
  }
}
`),
    declines(`export async function run() {
  for (const tags of emails) {
    const members = await repo.findBy({ tags });
    out.push(members.length);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    if (members.length === 0) {
      break;
    }
    out.push(members);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    out.push(members.map((member) => {
      member.status = 'x';
      return member;
    }));
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    members.length = 0;
    out.push(members);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    out.push(members.splice(0, 1));
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    members.forEach((member) => {
      member.name = 'x';
    });
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    members[0] = members[1]!;
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    let members = await repo.findBy({ teamId });
    members = members.filter(Boolean);
    out.push(members);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, order: { id: 'ASC' }, take: 1 });
    out.push(members.length);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, lock: { mode: 'pessimistic_write' } });
    out.push(members.length);
  }
}
`),
    declines(`export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: [{ teamId }, { status: 'on' }] });
    out.push(members.length);
  }
}
`),
  ],
});
