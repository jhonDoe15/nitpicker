import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MESSY = 'src/main/java/demo/Messy.java';
export const ROOMY = 'src/main/java/demo/Roomy.java';
export const LOOSE = 'src/main/java/demo/Loose.java';

export const MESSY_SOURCE = 'package demo;\n\nclass Messy {\n  int a;\n}\n';

export const ROOMY_SOURCE = `package demo;

public final class Roomy {
    private Roomy() {}

    public static String describe(String firstName, String lastName, String city, String country, int age) {
        return firstName + lastName + city + country + age;
    }
}
`;

export const LOOSE_SOURCE = `package demo;

import java.util.List;

public final class Loose {
    private final int n = 1;

    public int value() {
        if (n > 0) {
            return n;
        }
        return 0;
    }
}
`;

export const OPTED_IN_CHECKSTYLE = `<?xml version="1.0"?>
<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"
  "https://checkstyle.org/dtds/configuration_1_3.dtd">
<module name="Checker">
  <module name="TreeWalker">
    <module name="AvoidStarImport"/>
  </module>
</module>
`;

export function withFourSpaces(root) {
  const base = path.resolve(root, 'src');
  for (const file of readdirSync(base, { recursive: true })) {
    const source = path.resolve(base, file);
    if (!source.startsWith(`${base}${path.sep}`)) {
      throw new Error(`${file} leaves ${base}`);
    }
    if (source.endsWith('.java')) {
      writeFileSync(source, readFileSync(source, 'utf8').replaceAll(/^( +)/gmu, '$1$1'));
    }
  }
}

export function summaryOf(findings, matches) {
  return findings.filter(matches).map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);
}

export function isFormatting({ tool, rule }) {
  return (
    ['google-java-format', 'palantir-java-format'].includes(tool) ||
    (tool === 'checkstyle' && ['Indentation', 'UnusedImports', 'MemberName'].includes(rule)) ||
    rule === 'line-length-limit'
  );
}
