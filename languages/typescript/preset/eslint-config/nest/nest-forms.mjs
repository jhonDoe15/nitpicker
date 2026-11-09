const PROVIDER_DECORATORS = [
  'Controller',
  'Injectable',
  'Module',
  'Catch',
  'WebSocketGateway',
  'Resolver',
  'Processor',
  'Scalar',
  'Plugin',
  'ValidatorConstraint',
];
const PROVIDER_INTERFACES = [
  'CanActivate',
  'PipeTransform',
  'NestInterceptor',
  'ExceptionFilter',
  'NestMiddleware',
  'CustomScalar',
  'ValidatorConstraintInterface',
];
const DTO_BASES = ['createZodDto', 'PartialType', 'PickType', 'OmitType', 'IntersectionType'];

function anyOf(names) {
  return `/^(${names.join('|')})$/`;
}

const LISTED_POSITIONS = [0, 1, 2, 3];

function listedAt(list, member, names) {
  const forms = LISTED_POSITIONS.flatMap((position) => [
    `[${list}.${String(position)}.${member}.name=${anyOf(names)}]`,
    `[${list}.${String(position)}.${member}.property.name=${anyOf(names)}]`,
  ]);
  return `:matches(${forms.join(', ')})`;
}

const decorated = listedAt('decorators', 'expression.callee', PROVIDER_DECORATORS);
const implementing = listedAt('implements', 'expression', PROVIDER_INTERFACES);
const dataOnlyBody =
  ':not(:has(MethodDefinition, StaticBlock, TSIndexSignature, AccessorProperty))' +
  ':not(:has(PropertyDefinition:not(:has(Decorator))))';
const dtoShape = `:matches(:has(PropertyDefinition), [superClass.callee.name=${anyOf(DTO_BASES)}])${dataOnlyBody}`;
const providerClass = `:matches(ClassDeclaration, ClassExpression):matches(${decorated}, ${implementing})`;

export const nestClassExclusions = `:not(${decorated}):not(${implementing}):not(${dtoShape})`;

export const nestExceptionSuperclass =
  ':not([superClass.name=/Exception$/]):not([superClass.property.name=/Exception$/])';

export const nestClassMessage =
  'Classes are only for `Error` subclasses and, with NestJS, `*Exception` subclasses, providers decorated with ' +
  '`@Controller`, `@Injectable`, `@Module` or another NestJS class decorator, guards, pipes, interceptors, ' +
  'filters and middleware that implement their NestJS interface, and DTOs that hold only decorated properties ' +
  'or extend `createZodDto(...)` or `PartialType(...)`. Use a `type` for other data and `function` ' +
  'declarations for behavior.';

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
