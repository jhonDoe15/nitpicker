import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import type { OrmCall } from './orm-call.mts';
import { prismaKey, prismaSchema } from './prisma-schema.mts';
import { projectDependencies } from './project-files.mts';
import { typeormKeyColumn, type KeyColumn } from './typeorm-columns.mts';

export function keyColumn(
  context: Context,
  call: OrmCall,
  property: string,
): KeyColumn | undefined {
  const services = typeServices(context);
  if (call.orm === 'typeorm' && call.entity !== undefined && services !== undefined) {
    return typeormKeyColumn(services.program.getTypeChecker(), call.entity, {
      property,
      dependencies: projectDependencies(context.filename),
    });
  }
  if (call.orm !== 'prisma' || call.model === undefined) {
    return undefined;
  }
  const schema = prismaSchema(call.declarationFile);
  return schema === undefined ? undefined : prismaKey(schema, call.model, property);
}
