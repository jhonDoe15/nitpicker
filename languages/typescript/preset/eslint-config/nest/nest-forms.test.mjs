import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { strictSyntaxConfig, strictSyntaxConfigFor } from '../strict.mjs';
import { nestClassMessage } from './nest-forms.mjs';

const nestConfig = strictSyntaxConfigFor(defaultResolvedLayout, { nest: true });
const ADAPTER = 'src/main/features/cats/adapters/cats.ts';
const DOMAIN = 'src/main/features/cats/domain/cats.ts';
const INJECTION = 'Take each dependency as a `private readonly` constructor parameter';

function restricted(code, { config = nestConfig, file = ADAPTER } = {}) {
  return lintFixture({ config, filename: file, code })
    .filter(({ ruleId }) => ruleId === 'no-restricted-syntax')
    .map(({ line, message }) => ({ line, message }));
}

function linesNaming(code, text, options) {
  return restricted(code, options)
    .filter(({ message }) => message.startsWith(text))
    .map(({ line }) => line);
}

const ALLOWED_FORMS = {
  controller: "@Controller('cats') export class CatsController { list() { return []; } }",
  provider: '@Injectable() export class CatsService { run() { return 1; } }',
  module: '@Module({ providers: [] }) export class CatsModule {}',
  'global module': '@Global() @Module({}) export class SharedModule {}',
  filter: '@Catch() export class AllFilter { catch() { return 1; } }',
  gateway: '@WebSocketGateway() export class Events { handle() { return 1; } }',
  resolver: '@Resolver() export class CatsResolver { cats() { return []; } }',
  processor:
    "@Processor('audio') export class Audio extends WorkerHost { process() { return 1; } }",
  guard: 'export class Guard implements CanActivate { canActivate() { return true; } }',
  pipe: 'export class Trim implements PipeTransform { transform(value: string) { return value; } }',
  interceptor: 'export class Timing implements NestInterceptor { intercept() { return 1; } }',
  'exception filter': 'export class Mapper implements ExceptionFilter { catch() { return 1; } }',
  middleware: 'export class Log implements NestMiddleware { use() { return 1; } }',
  'validated DTO':
    'export class CreateCat { @IsString() readonly name!: string; @IsInt() age!: number; }',
  'GraphQL type': '@ObjectType() export class Cat { @Field() readonly name!: string; }',
  'zod DTO': 'export class CreateCat extends createZodDto(CatSchema) {}',
  'mapped DTO': 'export class UpdateCat extends PartialType(CreateCat) {}',
  'mapped DTO with fields':
    'export class Picked extends PickType(Cat, ["name"]) { @IsInt() age!: number; }',
  'HTTP exception': 'export class CatMissing extends NotFoundException {}',
  'qualified exception': 'export class CatGone extends common.HttpException {}',
  'qualified decorator': '@common.Injectable() export class Cats { run() { return 1; } }',
  'qualified interface':
    'export class Guard implements common.CanActivate { canActivate() { return true; } }',
  'third decorator':
    '@UseGuards(A) @SetMetadata("k", 1) @Controller() export class Cats { list() { return []; } }',
  'custom validator': '@ValidatorConstraint() export class Unique { validate() { return true; } }',
  scalar:
    "@Scalar('Date') export class DateScalar implements CustomScalar { parseValue() { return 1; } }",
};

const BANNED_FORMS = {
  'plain class': 'export class Cats { list() { return []; } }',
  'undecorated data class': 'export class Cat { readonly name!: string; }',
  'DTO with a method': 'export class Cat { @IsString() name!: string; describe() { return 1; } }',
  'DTO with a plain field': 'export class Cat { @IsString() name!: string; age!: number; }',
  'DTO with a constructor':
    'export class Cat { @IsString() name!: string; constructor() { this.name = ""; } }',
  'mapped DTO with a method': 'export class Cat extends PartialType(Base) { run() { return 1; } }',
  'plain subclass': 'export class Cats extends Base {}',
  'other decorator': '@Entity() export class Cat { run() { return 1; } }',
  'other interface': 'export class Cats implements OnModuleInit { onModuleInit() { return 1; } }',
  'class expression': 'export const Cats = class { run() { return 1; } };',
  'class with a decorated method': 'export class Cats { @Injectable() run() { return 1; } }',
  'class with a decorated parameter':
    'export class Cats { run(@Catch() id: number) { return id; } }',
  'class holding a NestJS class':
    'export class Cats { run() { @Injectable() class Inner {} return Inner; } }',
  'class holding a guard':
    'export class Cats { run() { return class implements CanActivate { canActivate() { return true; } }; } }',
};

describe('NestJS class forms', () => {
  it.each(Object.entries(ALLOWED_FORMS))('allows a %s in adapters', (_form, code) => {
    expect(restricted(code)).toEqual([]);
  });

  it.each(Object.entries(BANNED_FORMS))('bans a %s and names the NestJS forms', (_form, code) => {
    expect(restricted(code)).toEqual([{ line: 1, message: nestClassMessage }]);
  });

  it('keeps every class out of domain/', () => {
    const messages = restricted(ALLOWED_FORMS.provider, { file: DOMAIN });

    expect(
      messages.map(({ message }) => message.startsWith('Classes are only for `Error`')),
    ).toEqual([true]);
    expect(messages[0].message).not.toBe(nestClassMessage);
  });

  it('keeps exception subclasses out of domain/', () => {
    expect(restricted(ALLOWED_FORMS['HTTP exception'], { file: DOMAIN })).toHaveLength(1);
  });

  it('keeps the class ban when the project does not use NestJS', () => {
    expect(restricted(ALLOWED_FORMS.provider, { config: strictSyntaxConfig })).toHaveLength(1);
  });
});

describe('dependencies of NestJS classes', () => {
  it('allows private readonly constructor parameters, also with an injection token', () => {
    const code = [
      '@Injectable()',
      'export class Cats {',
      '  constructor(private readonly store: Store, @Inject(CONFIG) private readonly config: Config) {}',
      '}',
    ].join('\n');

    expect(restricted(code)).toEqual([]);
  });

  it.each([
    ['plain parameter', 'constructor(store: Store) { this.store = store; }'],
    ['public parameter property', 'constructor(public store: Store) {}'],
    ['readonly parameter property', 'constructor(readonly store: Store) {}'],
    ['private mutable parameter property', 'constructor(private store: Store) {}'],
    ['protected parameter property', 'constructor(protected readonly store: Store) {}'],
    ['default parameter', 'constructor(store = new Store()) {}'],
  ])('reports a %s of a provider', (_form, member) => {
    const code = `@Injectable()\nexport class Cats {\n  ${member}\n}`;

    expect(linesNaming(code, INJECTION)).toEqual([3]);
  });

  it('reports constructor parameters of guards found by their interface', () => {
    const code = 'export class Guard implements CanActivate {\n  constructor(store: Store) {}\n}';

    expect(linesNaming(code, INJECTION)).toEqual([2]);
  });

  it('leaves constructors of exception classes alone', () => {
    const code =
      'export class CatMissing extends NotFoundException {\n  constructor(id: string) { super(id); }\n}';

    expect(restricted(code)).toEqual([]);
  });

  it.each(['Inject(Store)', 'InjectRepository(Cat)', 'InjectQueue("audio")'])(
    'reports property injection with @%s',
    (decorator) => {
      const code = `@Injectable()\nexport class Cats {\n  @${decorator} private readonly store!: Store;\n}`;

      expect(linesNaming(code, INJECTION)).toEqual([3]);
    },
  );

  it('reports ModuleRef service location in a constructor and in a function', () => {
    const code = [
      '@Injectable()',
      'export class Cats {',
      '  constructor(private readonly refs: ModuleRef) {}',
      '}',
      'export function lookUp(refs: ModuleRef) { return refs; }',
    ].join('\n');

    expect(linesNaming(code, 'Inject the provider you need through the constructor')).toEqual([
      3, 5,
    ]);
  });

  it('leaves the dependency rules out of projects without NestJS', () => {
    const code = 'export class CatMissing extends Error {\n  @Inject(Store) store!: Store;\n}';

    expect(restricted(code, { config: strictSyntaxConfig })).toEqual([]);
  });
});
