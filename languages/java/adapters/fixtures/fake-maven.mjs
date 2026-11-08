#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';

const output = process.argv
  .find((argument) => argument.startsWith('-Doutput='))
  ?.slice('-Doutput='.length);
if (output === undefined) {
  process.stderr.write('fake maven only writes an effective POM\n');
  process.exit(1);
}
copyFileSync(existsSync('effective-pom.xml') ? 'effective-pom.xml' : 'pom.xml', output);
