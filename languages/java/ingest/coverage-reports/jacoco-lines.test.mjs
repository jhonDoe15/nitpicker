import { describe, expect, it } from 'vitest';
import { parseXml } from '../../../../shared/ingest/common.mjs';
import { jacocoLineUnits } from './jacoco-lines.mjs';

const REPORT = `<report name="demo"><package name="demo/app">
  <sourcefile name="Boot.kt">
    <line nr="4" mi="0" ci="3" mb="0" cb="0"/>
    <line nr="5" mi="2" ci="0" mb="1" cb="1"/>
    <line nr="6" mi="0" ci="2" mb="2" cb="0"/>
    <line mi="1" ci="0"/>
  </sourcefile>
</package><package name="">
  <sourcefile name="Root.kt"><line nr="1" mi="0" ci="1"/></sourcefile>
</package></report>`;

describe('jacocoLineUnits', () => {
  it('turns each source line into a one-line unit keyed by package and file name', () => {
    const unit = (line, lines, branches) => ({
      name: '<line>',
      className: '',
      line,
      lines,
      branches,
    });

    expect(jacocoLineUnits(parseXml(REPORT))).toEqual(
      new Map([
        [
          'demo/app/Boot.kt',
          [
            unit(4, { covered: 1, total: 1 }, { covered: 0, total: 0 }),
            unit(5, { covered: 0, total: 1 }, { covered: 1, total: 2 }),
            unit(6, { covered: 1, total: 1 }, { covered: 0, total: 2 }),
          ],
        ],
        ['Root.kt', [unit(1, { covered: 1, total: 1 }, { covered: 0, total: 0 })]],
      ]),
    );
  });
});
