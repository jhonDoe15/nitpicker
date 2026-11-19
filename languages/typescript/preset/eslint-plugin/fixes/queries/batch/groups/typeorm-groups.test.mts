import { rule as ioInLoop } from '../../../../rules/loops/no-io-in-loop.mts';
import { ormProject } from '../../../../test-support/projects/orm-project.mts';
import { typeormCases } from '../../../../test-support/queries/batch-cases.mts';

const { project, pair } = typeormCases(ormProject('typeorm-groups'), 'batchGroups');

project.tester.run('typeorm lists grouped by key', ioInLoop, {
  valid: [],
  invalid: [
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, order: { name: 'ASC' }, relations: ['team'] });
    out.push(members.map((member) => member.email));
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.find({ where: { teamId: In(part) }, order: { name: 'ASC' }, relations: ['team'] })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    out.push(members.map((member) => member.email));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const event of events) {
    const members = await repo.findBy({ workspaceId: event.workspaceId });
    out.push([...members]);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(events.map((event) => event.workspaceId)));
  const membersByWorkspaceId = new Map<string, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ workspaceId: In(part) })) {
      const group = membersByWorkspaceId.get(row.workspaceId);
      if (group === undefined) {
        membersByWorkspaceId.set(row.workspaceId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const event of events) {
    const members = membersByWorkspaceId.get(event.workspaceId) ?? [];
    out.push([...members]);
  }
}
`,
      { report: 'foreignKeyQuery' },
    ),
    pair(
      `export async function run() {
  const groups = await Promise.all(
    ids.map(async (teamId) => {
      const members = await repo.findBy({ teamId });
      return members.filter((member) => member.status === 'on');
    }),
  );
  use(groups);
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ teamId: In(part) })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  const groups = await Promise.all(
    ids.map(async (teamId) => {
      const members = membersByTeamId.get(teamId) ?? [];
      return members.filter((member) => member.status === 'on');
    }),
  );
  use(groups);
}
`,
      { report: 'concurrentQuery' },
    ),
    pair(
      `export async function run() {
  for (const status of emails) {
    const members = await repo.find({ where: { status, workspaceId }, select: ['id', 'status', 'name'] });
    out.push(members.length);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(emails));
  const membersByStatus = new Map<string, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.find({ where: { status: In(part), workspaceId }, select: ['id', 'status', 'name'] })) {
      const group = membersByStatus.get(row.status);
      if (group === undefined) {
        membersByStatus.set(row.status, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const status of emails) {
    const members = membersByStatus.get(status) ?? [];
    out.push(members.length);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    out.push(members.length);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ teamId: In(part) })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    out.push(members.length);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    const names = members.map((member) => member.name);
    out.push(names);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ teamId: In(part) })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    const names = members.map((member) => member.name);
    out.push(names);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    if (members.length > 0) {
      out.push(members.filter((member) => member.status === 'on'));
    }
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ teamId: In(part) })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    if (members.length > 0) {
      out.push(members.filter((member) => member.status === 'on'));
    }
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId, status: 'on' } });
    out.push(members.some((member) => member.id === 1));
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.find({ where: { teamId: In(part), status: 'on' } })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    out.push(members.some((member) => member.id === 1));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, order: { id: 'DESC' } });
    out.push(members.find((member) => member.name === 'a'));
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.find({ where: { teamId: In(part) }, order: { id: 'DESC' } })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    out.push(members.find((member) => member.name === 'a'));
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.findBy({ teamId });
    console.log(members);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.findBy({ teamId: In(part) })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    console.log(members);
  }
}
`,
    ),
    pair(
      `export async function run() {
  for (const teamId of ids) {
    const members = await repo.find({ where: { teamId }, relations: ['team'], withDeleted: true });
    out.push(members.length);
  }
}
`,
      `export async function run() {
  const keys = Array.from(new Set(ids));
  const membersByTeamId = new Map<number, User[]>();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    for (const row of await repo.find({ where: { teamId: In(part) }, relations: ['team'], withDeleted: true })) {
      const group = membersByTeamId.get(row.teamId);
      if (group === undefined) {
        membersByTeamId.set(row.teamId, [row]);
      } else {
        group.push(row);
      }
    }
  }
  for (const teamId of ids) {
    const members = membersByTeamId.get(teamId) ?? [];
    out.push(members.length);
  }
}
`,
    ),
  ],
});
