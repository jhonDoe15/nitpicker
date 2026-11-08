# NestJS

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

Applies when `@nestjs/core` is in `dependencies` or `peerDependencies`. Every other class, `enum`
and `interface` stays banned, and `domain/` has no classes at all: put these in `adapters/`.

- Classes only in NestJS's forms: decorated with `@Controller`, `@Injectable`, `@Module`, `@Catch`,
  `@WebSocketGateway`, `@Resolver` or `@Processor`; implementing `CanActivate`, `PipeTransform`,
  `NestInterceptor`, `ExceptionFilter` or `NestMiddleware`; an exception extending
  `HttpException` or `NotFoundException`; or a DTO.
- A DTO holds only decorated properties (`@IsString() readonly name!: string`), or extends
  `createZodDto(Schema)` or `PartialType(...)` (`PickType`, `OmitType`, `IntersectionType`): no
  methods, constructor or plain fields.
- Take dependencies only as `private readonly` constructor parameters:
  `constructor(private readonly users: UsersService) {}`. No `@Inject()` on properties, and no
  `ModuleRef` lookups.
- Keep value imports of injected classes (`import { UsersService }`, not `import type`): with
  `emitDecoratorMetadata` NestJS reads the parameter types at run time.
