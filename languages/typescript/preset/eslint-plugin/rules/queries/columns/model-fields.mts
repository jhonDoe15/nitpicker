import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { typeServices } from '../../security/security-values.mts';

const LOOSE_TYPES = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
const COLUMN_DECORATORS = new Set([
  'Column',
  'PrimaryColumn',
  'PrimaryGeneratedColumn',
  'CreateDateColumn',
  'UpdateDateColumn',
  'DeleteDateColumn',
  'VersionColumn',
  'ObjectIdColumn',
  'Property',
  'PrimaryKey',
  'Enum',
  'AllowNull',
  'AutoIncrement',
  'Default',
  'Unique',
]);

function decoratorNames(declaration) {
  const decorators = ts.canHaveDecorators(declaration) ? (ts.getDecorators(declaration) ?? []) : [];
  return decorators.map(({ expression }) => {
    const callee = ts.isCallExpression(expression) ? expression.expression : expression;
    return ts.isIdentifier(callee) ? callee.text : '';
  });
}

function isColumn(declaration) {
  const isProperty = ts.isPropertyDeclaration(declaration) || ts.isPropertySignature(declaration);
  const names = decoratorNames(declaration);
  return isProperty && (names.length === 0 || names.some((name) => COLUMN_DECORATORS.has(name)));
}

export function isModelField(context, awaited, name) {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const rows = services.getTypeAtLocation(awaited);
  const element = checker.getIndexTypeOfType(rows, ts.IndexKind.Number);
  if (element === undefined || (element.flags & LOOSE_TYPES) !== 0) {
    return false;
  }
  const declarations = checker.getPropertyOfType(element, name)?.declarations ?? [];
  return declarations.length > 0 && declarations.every(isColumn);
}
