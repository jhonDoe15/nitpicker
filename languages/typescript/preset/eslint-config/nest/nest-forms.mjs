const PROVIDER_DECORATORS = [
  'Controller',
  'Injectable',
  'Module',
  'Catch',
  'WebSocketGateway',
  'Resolver',
  'Processor',
];
const PROVIDER_INTERFACES = [
  'CanActivate',
  'PipeTransform',
  'NestInterceptor',
  'ExceptionFilter',
  'NestMiddleware',
];
const DTO_BASES = ['createZodDto', 'PartialType', 'PickType', 'OmitType', 'IntersectionType'];

function anyOf(names) {
  return `/^(${names.join('|')})$/`;
}

const decorated = `:has(Decorator > CallExpression.expression > Identifier.callee[name=${anyOf(PROVIDER_DECORATORS)}])`;
const implementing = `:has(TSClassImplements > Identifier.expression[name=${anyOf(PROVIDER_INTERFACES)}])`;
const dataOnlyBody =
  ':not(:has(MethodDefinition, StaticBlock, TSIndexSignature, AccessorProperty))' +
  ':not(:has(PropertyDefinition:not(:has(Decorator))))';
const dtoShape = `:matches(:has(PropertyDefinition), [superClass.callee.name=${anyOf(DTO_BASES)}])${dataOnlyBody}`;
const providerClass = `:matches(ClassDeclaration, ClassExpression):matches(${decorated}, ${implementing})`;

export const nestClassExclusions = `:not(${decorated}):not(${implementing}):not(${dtoShape})`;

export const nestExceptionSuperclass =
  ':not([superClass.name=/Exception$/]):not([superClass.property.name=/Exception$/])';

export const nestClassMessage =
  'Classes are only for `Error` and `HttpException` subclasses and the NestJS forms: a class decorated with ' +
  '`@Controller`, `@Injectable`, `@Module`, `@Catch`, `@WebSocketGateway`, `@Resolver` or `@Processor`, ' +
  'one that implements `CanActivate`, `PipeTransform`, `NestInterceptor`, `ExceptionFilter` or ' +
  '`NestMiddleware`, and a DTO whose members are all decorated properties or that extends ' +
  '`createZodDto(...)` or a mapped type such as `PartialType(...)`. Use a `type` for other data and ' +
  '`function` declarations for behavior.';

const CONSTRUCTOR_INJECTION =
  'Take each dependency as a `private readonly` constructor parameter: ' +
  '`constructor(private readonly users: UsersService) {}`.';
const nestConstructor = "MethodDefinition[kind='constructor'] > FunctionExpression";
const constructorParameters = `${providerClass} > ClassBody > ${nestConstructor}`;
const PLAIN_PARAMETERS = 'Identifier, AssignmentPattern, ObjectPattern, ArrayPattern, RestElement';

export const nestSelectors = [
  {
    selector:
      'PropertyDefinition > Decorator > CallExpression.expression > Identifier.callee[name=/^Inject/]',
    message: `${CONSTRUCTOR_INJECTION} Property injection hides the dependency from the constructor.`,
  },
  {
    selector: `${constructorParameters} > :matches(${PLAIN_PARAMETERS})`,
    message: CONSTRUCTOR_INJECTION,
  },
  {
    selector: `${constructorParameters} > TSParameterProperty:not([accessibility='private'][readonly=true])`,
    message: CONSTRUCTOR_INJECTION,
  },
  {
    selector: "TSTypeReference > Identifier.typeName[name='ModuleRef']",
    message:
      'Inject the provider you need through the constructor instead of looking it up through `ModuleRef`. ' +
      'An exception fits only when it is deliberate, such as resolving a request-scoped or transient provider.',
  },
];
