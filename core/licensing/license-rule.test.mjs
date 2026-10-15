import { describe, expect, it } from 'vitest';
import {
  classifyExpression,
  offersChoice,
  declaredExpression,
  forbiddenLicenseText,
  PERMISSIVE,
  REJECTED,
  WEAK_COPYLEFT,
} from './test-support/license-rule.mjs';

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
    ['\u0001permissive', REJECTED],
    ['BSD-style', REJECTED],
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
    ['# GNU GENERAL PUBLIC LICENSE\nVersion 2, June 1991', 'GPL or AGPL'],
    ['**GNU GENERAL PUBLIC LICENSE**\n**Version 3, 29 June 2007**', 'GPL or AGPL'],
    ['Licensed under the GNU General Public License Version 3', 'GPL or AGPL'],
    ['GNU\nGENERAL PUBLIC\nLICENSE\nVersion 2', 'GPL or AGPL'],
    ['Creative Commons Attribution-NonCommercial 4.0', 'Creative Commons NonCommercial'],
    ['Sustainable Use License\nVersion 1.0', 'Sustainable Use License'],
    ['Redis Source Available License 2.0 (RSALv2)', 'Redis Source Available License'],
    ['The Prosperity Public License 3.0.0', 'Prosperity Public License'],
    ['  GNU GENERAL PUBLIC LICENSE\n Version 2', 'GPL or AGPL'],
    ['Server Side Public License\nVERSION 1', 'SSPL'],
    ['Sonar Source-Available License v1.0', 'SSALv1'],
    ['Business Source License 1.1', 'BSL'],
    ['Elastic License 2.0', 'Elastic License'],
    ['"Commons Clause" License Condition v1.0', 'Commons Clause'],
    ['PolyForm Noncommercial License 1.0.0', 'PolyForm'],
    ['PolyForm-Shield License 1.0.0', 'PolyForm'],
    [
      'This program is distributed under the terms of the GNU General Public License.',
      'GPL or AGPL',
    ],
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

describe('forbiddenLicenseText on license text that only mentions a name', () => {
  it('accepts an MIT license that mentions the products by name', () => {
    expect(
      forbiddenLicenseText(
        'MIT License. Not based on PolyForm, the Elastic License or the Business Source License.',
      ),
    ).toBeUndefined();
  });

  it('accepts the GPL text next to an LGPL license only when allowed', () => {
    const gpl = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007';

    expect(forbiddenLicenseText(gpl)).toBe('GPL or AGPL');
    expect(forbiddenLicenseText(gpl, { allowGpl: true })).toBeUndefined();
    expect(forbiddenLicenseText('Business Source License 1.1', { allowGpl: true })).toBe('BSL');
  });
});

describe('classifyExpression for Java tools', () => {
  it('accepts an extra permissive name only when the caller passes it', () => {
    const extraPermissive = new Set(['BSD-style']);

    expect(classifyExpression('BSD-style', { extraPermissive })).toBe(PERMISSIVE);
    expect(classifyExpression('BSD-style')).toBe(REJECTED);
  });
});

describe('offersChoice', () => {
  it('is true for an OR with an acceptable arm and false otherwise', () => {
    expect(offersChoice('(MIT OR GPL-3.0)')).toBe(true);
    expect(offersChoice('MIT')).toBe(false);
    expect(offersChoice('GPL-3.0 OR AGPL-3.0')).toBe(false);
  });
});
