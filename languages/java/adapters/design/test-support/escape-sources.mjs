import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../../../../../shared/conventions/read-inside.mjs';

function write(root, file, text) {
  const full = resolveInside(root, file);
  if (full === undefined) {
    throw new Error(`${file} is outside ${root}`);
  }
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

export function writeEscape(root, { owner, caller }) {
  const ledger = `${owner.root}/src/main/java/${owner.package.replaceAll('.', '/')}/Ledger.java`;
  const report = `${caller.root}/src/main/java/${caller.package.replaceAll('.', '/')}/Report.java`;
  write(
    root,
    ledger,
    `package ${owner.package};

import java.util.ArrayList;
import java.util.List;

public final class Ledger {
  private final List<String> entries = new ArrayList<>();

  public List<String> entries() {
    return entries;
  }
}
`,
  );
  write(
    root,
    report,
    `package ${caller.package};

import ${owner.package}.Ledger;

public final class Report {
  private Report() {}

  public static void note(Ledger ledger) {
    ledger.entries().add("seen");
  }
}
`,
  );
  return {
    tool: 'java',
    rule: 'mutable-state-escape',
    path: report,
    identity: `${report}#Report.note>${ledger}#Ledger.entries:add`,
    message: `Report.note changes the private \`entries\` of Ledger through the value \`Ledger.entries\` returns (\`add\`), so Ledger no longer controls its own state. Return a copy or a read-only view from \`Ledger.entries\`, or add an operation to Ledger that makes this change. If this is intended, add {"rule":"mutable-state-escape","paths":["${report}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    classification: 'enforceable',
    symbol: 'Report.note',
    location: { line: 9 },
  };
}

function sourcePath(side, name) {
  return `${side.root}/src/main/java/${side.package.replaceAll('.', '/')}/${name}.java`;
}

export const POOL_PROTOCOL = { type: 'Pool', open: ['acquire'], close: ['close'] };

export function writePool(root, { owner, caller }) {
  write(
    root,
    sourcePath(owner, 'AbstractRes'),
    `package ${owner.package};

public abstract class AbstractRes implements AutoCloseable {
  @Override
  public void close() {}
}
`,
  );
  write(
    root,
    sourcePath(owner, 'Pool'),
    `package ${owner.package};

public class Pool extends AbstractRes {
  public void acquire() {}
}
`,
  );
  const users = sourcePath(caller, 'Users');
  write(
    root,
    users,
    `package ${caller.package};

import ${owner.package}.Pool;

public final class Users {
  private Users() {}

  public static void pooled() {
    try (Pool pool = new Pool()) {
      pool.acquire();
    }
  }

  public static void leaked() {
    Pool pool = new Pool();
    pool.acquire();
  }
}
`,
  );
  return {
    tool: 'java',
    rule: 'protocol-contract',
    path: users,
    identity: `${users}#Users.leaked|pool|unclosed:acquire`,
    message: `Users.leaked calls \`pool.acquire\` but closes Pool with \`close\` on no exit path that always runs. The \`protocols\` contract for Pool needs the close in a finally block (or with, use, try-with-resources, using), or one operation that owns both steps. If this is intended, add {"rule":"protocol-contract","paths":["${users}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    classification: 'enforceable',
    symbol: 'Users.leaked',
    location: { line: 16 },
  };
}
