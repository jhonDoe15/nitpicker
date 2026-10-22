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
