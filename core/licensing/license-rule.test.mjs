import { describe, expect, it } from 'vitest';
import {
  classifyExpression,
  declaredExpression,
  forbiddenLicenseText,
  PERMISSIVE,
  REJECTED,
  WEAK_COPYLEFT,
} from './license-rule.mjs';

describe('classifyExpression', () => {
  it.each([
    ['MIT', PERMISSIVE],
    ['Apache-2.0', PERMISSIVE],
    ['BSD-3-Clause', PERMISSIVE],
    ['ISC', PERMISSIVE],
    ['LGPL-2.1', WEAK_COPYLEFT],
    ['LGPL-3.0-or-later', WEAK_COPYLEFT],
    ['LGPL-2.1+', WEAK_COPYLEFT],
    ['EPL-2.0', WEAK_COPYLEFT],
    ['MPL-2.0', WEAK_COPYLEFT],
    ['GPL-2.0', REJECTED],
    ['GPL-3.0-only', REJECTED],
    ['AGPL-3.0', REJECTED],
    ['GPL-2.0 WITH Classpath-exception-2.0', REJECTED],
    ['SSPL-1.0', REJECTED],
    ['BUSL-1.1', REJECTED],
    ['Elastic-2.0', REJECTED],
    ['SEE LICENSE IN LICENSE.md', REJECTED],
    ['UNLICENSED', REJECTED],
  ])('%s is %s', (expression, verdict) => {
    expect(classifyExpression(expression)).toBe(verdict);
  });

  it.each([
    ['(MIT OR GPL-3.0)', PERMISSIVE],
    ['GPL-3.0 OR LGPL-2.1', WEAK_COPYLEFT],
    ['MIT AND GPL-3.0', REJECTED],
    ['MIT AND MPL-2.0', WEAK_COPYLEFT],
    ['(MIT AND Apache-2.0) OR GPL-3.0', PERMISSIVE],
    ['MIT AND (GPL-3.0 OR BSD-2-Clause)', PERMISSIVE],
    ['MIT AND (GPL-3.0 OR SSPL-1.0)', REJECTED],
    ['(Apache-2.0 OR (MIT AND ISC))', PERMISSIVE],
  ])('expression %s is %s', (expression, verdict) => {
    expect(classifyExpression(expression)).toBe(verdict);
  });
});

describe('declaredExpression', () => {
  it('reads the SPDX string, the legacy object and the legacy array', () => {
    expect(declaredExpression({ license: 'MIT' })).toBe('MIT');
    expect(declaredExpression({ license: { type: 'ISC' } })).toBe('ISC');
    expect(declaredExpression({ licenses: [{ type: 'MIT' }, 'Apache-2.0'] })).toBe(
      'MIT OR Apache-2.0',
    );
  });

  it('is undefined without a license', () => {
    expect(declaredExpression({})).toBeUndefined();
    expect(declaredExpression({ licenses: [] })).toBeUndefined();
  });
});

describe('forbiddenLicenseText', () => {
  it.each([
    ['GNU AFFERO GENERAL PUBLIC LICENSE\n Version 3', 'GPL or AGPL'],
    ['  GNU GENERAL PUBLIC LICENSE\n Version 2', 'GPL or AGPL'],
    ['Server Side Public License\nVERSION 1', 'SSPL'],
    ['Sonar Source-Available License v1.0', 'SSALv1'],
    ['Business Source License 1.1', 'BSL'],
    ['Elastic License 2.0', 'Elastic License'],
    ['MIT with Commons Clause', 'Commons Clause'],
    ['PolyForm Noncommercial', 'PolyForm'],
    ['Functional Source License, Version 1.1', 'Functional Source License'],
  ])('flags %j', (text, name) => {
    expect(forbiddenLicenseText(text)).toBe(name);
  });

  it('accepts MIT, Apache and the LGPL text that mentions the GPL in a sentence', () => {
    expect(forbiddenLicenseText('MIT License\nPermission is hereby granted')).toBeUndefined();
    expect(forbiddenLicenseText('Apache License\nVersion 2.0, January 2004')).toBeUndefined();
    expect(
      forbiddenLicenseText(
        'GNU LESSER GENERAL PUBLIC LICENSE\nincorporates the terms of version 3 of the GNU General Public License.',
      ),
    ).toBeUndefined();
  });
});
