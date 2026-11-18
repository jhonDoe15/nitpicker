import type TypeScript from 'typescript';
import { decoratorsOf } from '../../../rules/request-inputs/bindings/ts-nodes.mts';
import { typeormName } from './typeorm-columns.mts';

const LISTENERS = new Set([
  'BeforeInsert',
  'AfterInsert',
  'BeforeUpdate',
  'AfterUpdate',
  'BeforeRemove',
  'AfterRemove',
  'BeforeSoftRemove',
  'AfterSoftRemove',
  'BeforeRecover',
  'AfterRecover',
  'AfterLoad',
]);
const VERSION = 'VersionColumn';
const UPDATE_DATE = 'UpdateDateColumn';

function memberDecorators(checker: TypeScript.TypeChecker, entity: TypeScript.Type): string[] {
  return checker
    .getPropertiesOfType(entity)
    .flatMap((symbol) =>
      symbol.declarations === undefined
        ? []
        : symbol.declarations.flatMap((declaration) =>
            decoratorsOf(declaration).map((decorator) => typeormName(checker, decorator) ?? ''),
          ),
    );
}

export function hasPerRowEffects(
  checker: TypeScript.TypeChecker,
  entity: TypeScript.Type,
  uniqueKeys: boolean,
): boolean {
  const names = memberDecorators(checker, entity);
  return names.some(
    (name) => LISTENERS.has(name) || name === VERSION || (name === UPDATE_DATE && !uniqueKeys),
  );
}
