# NestJS

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

The NestJS layer turns on when `@nestjs/core` is in `dependencies` or `peerDependencies` of the
head checkout. A NestJS service is built from decorated classes, so the layer allows the
framework's class forms, and only those, the way the Java preset's Spring rules allow Spring's
forms. Every other class, `enum` and `interface` stays banned.

Allowed classes, outside `domain/`:

- A class decorated with `@Controller`, `@Injectable`, `@Module`, `@Catch`, `@WebSocketGateway`,
  `@Resolver`, `@Processor`, `@Scalar`, `@Plugin` or `@ValidatorConstraint`, also written as a
  member (`@common.Injectable()`). Only the class's own decorators count, not those of its
  members or of a class nested inside it.
- A class that implements `CanActivate`, `PipeTransform`, `NestInterceptor`, `ExceptionFilter`,
  `NestMiddleware`, `CustomScalar` or `ValidatorConstraintInterface`.
- A DTO: a class whose members are all decorated properties (`@IsString() readonly name!: string`,
  a GraphQL `@Field()`), or one that extends `createZodDto(...)` or a mapped type (`PartialType`,
  `PickType`, `OmitType`, `IntersectionType`) and adds only decorated properties. A DTO has no
  methods, constructor, accessors or plain fields. The check reads the class's shape, not where
  it is used: a class that holds only decorated properties counts as a DTO wherever it is.
- A subclass of a class whose name ends in `Exception`, such as
  `class CatMissing extends NotFoundException`, beside the `Error` subclasses every project may
  declare.

`domain/` keeps every class out, these forms included: providers, controllers and DTOs belong in
`adapters/`. An empty decorated class (`@Module({ ... }) export class CatsModule {}`) passes
`@typescript-eslint/no-extraneous-class`; an empty undecorated one still fails it.

Outside `domain/`, there is one way to take a dependency:

- Constructor injection with `private readonly` parameter properties:
  `constructor(private readonly users: UsersService) {}`, also with a token
  (`@Inject(CONFIG) private readonly config: Config`). A plain, `public`, `protected`, mutable or
  defaulted constructor parameter of one of the decorated or interface classes above is
  reported. Constructors of exception classes are not.
- No property injection: `@Inject()`, `@InjectRepository()` or any `@Inject...()` decorator on a
  class property is reported.
- No service location through `ModuleRef`: a `ModuleRef` type is reported, like the Spring rule
  `SpringNoServiceLocator`. An exception fits only when it is deliberate, such as resolving a
  request-scoped or transient provider.

The NestJS entry file is an entry point, so its `bootstrap()` call at module level is allowed:
the file `nest-cli.json` names with `sourceRoot` and `entryFile` (`src/main.ts` by default), and
in a monorepo the entry of each project under `projects`.

With `experimentalDecorators` and `emitDecoratorMetadata` in the project's `tsconfig.json`, the
compiler emits each constructor parameter's type as a runtime value, which is how NestJS finds the
provider to inject. An `import type` of that class would break the injection, so
`@typescript-eslint/consistent-type-imports` skips files with decorators there. The default oxlint
engine does not read those compiler options, so in any project with both options set (NestJS,
Angular, TypeORM), the rule runs through ESLint for the files that contain a decorator. That
builds the TypeScript program once for those files; the other files stay on oxlint.
