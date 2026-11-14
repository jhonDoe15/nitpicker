import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-generic-name.mjs';

const tester = typescriptRuleTester();

const file = (name) => ({ messageId: 'genericFile', data: { name } });
const folder = (name) => ({ messageId: 'genericFolder', data: { name } });
const type = (name) => ({ messageId: 'genericType', data: { name } });

tester.run('no-generic-name', rule, {
  valid: [
    { filename: 'src/main/orders/user.service.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/session.manager.ts', code: 'export const a = 1;' },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class CacheManagerImpl {} declare module "x-utils" {}',
    },
    { filename: 'src/main/orders/price-rounding.ts', code: 'export const a = 1;' },
    { filename: 'src/main/shared/price-rounding.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/utilization.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/commonwealth/rates.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/cache-manager.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/session-managers.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/index.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/rates.d.ts', code: 'export const a = 1;' },
    { filename: 'src/main/orders/a.ts', code: 'export class PriceRounder {}' },
    { filename: 'src/main/orders/a.ts', code: 'export class AuthenticationManager {}' },
    { filename: 'src/main/orders/a.ts', code: 'export class TransactionManagerImpl {}' },
    { filename: 'src/main/orders/a.ts', code: 'export class Utilization {} class Manageable {}' },
    { filename: 'src/main/orders/a.ts', code: 'export default class {}' },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class OrderManager extends EntityManager {}',
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class OrderHelper extends lib.BaseHelper {}',
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export interface ModelManager extends EntityManager {}',
    },
    { filename: 'src/main/orders/a.ts', code: 'export type OrderTotals = { total: number };' },
    { filename: 'src/main/orders/a.ts', code: 'export enum Status { Open }' },
    { filename: 'src/main/orders/a.ts', code: 'export const utils = {}; const helper = 1;' },
  ],
  invalid: [
    {
      filename: 'src/main/orders/utils.config.ts',
      code: 'export const a = 1;',
      errors: [file('utils')],
    },
    {
      filename: 'src/main/orders/manager.service.ts',
      code: 'export const a = 1;',
      errors: [file('manager')],
    },
    {
      filename: 'src/main/orders/common.module.ts',
      code: 'export const a = 1;',
      errors: [file('common')],
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class UserManagerImpl {} export namespace Helpers {} const x = class OrderUtils {};',
      errors: [type('UserManagerImpl'), type('Helpers'), type('OrderUtils')],
    },
    { filename: 'src/main/utils.ts', code: 'export const a = 1;', errors: [file('utils')] },
    {
      filename: 'src/main/orders/string-utils.ts',
      code: 'export const a = 1;',
      errors: [file('string-utils')],
    },
    {
      filename: 'src/main/orders/orderHelpers.ts',
      code: 'export const a = 1;',
      errors: [file('orderHelpers')],
    },
    {
      filename: 'src/main/orders/user.helper.ts',
      code: 'export const a = 1;',
      errors: [file('user.helper')],
    },
    {
      filename: 'src/main/orders/misc.d.ts',
      code: 'export const a = 1;',
      errors: [file('misc')],
    },
    {
      filename: 'src/main/orders/helper-functions.ts',
      code: 'export const a = 1;',
      errors: [file('helper-functions')],
    },
    {
      filename: 'src/main/orders/manager-v2.ts',
      code: 'export const a = 1;',
      errors: [file('manager-v2')],
    },
    {
      filename: 'src/main/common/rates.ts',
      code: 'export const a = 1;',
      errors: [folder('common/')],
    },
    {
      filename: 'src/main/utils/helpers.ts',
      code: 'export const a = 1;',
      errors: [file('helpers'), folder('utils/')],
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class OrderHelper {}',
      errors: [type('OrderHelper')],
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class StringUtils {} interface PriceCommon {} type Misc = {}; enum StatusManager { A }',
      errors: [type('StringUtils'), type('PriceCommon'), type('Misc'), type('StatusManager')],
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class OrderManager extends Base {}',
      errors: [type('OrderManager')],
    },
    {
      filename: 'src/main/orders/a.ts',
      code: 'export class UtilityMethods {} class HelperModule {}',
      errors: [type('UtilityMethods'), type('HelperModule')],
    },
  ],
});
