import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mjs';
import { yamlDocuments } from '../../../core/tooling/yaml/yaml-documents.mjs';
import { trackedFiles } from '../tracked-files.mjs';
import { fieldLimitFindings } from './field-limits.mjs';

const { createGitRepository } = useGitFixtures();

function check(files) {
  const { root } = createGitRepository(files);
  return fieldLimitFindings('repository-hygiene', {
    projectRoot: root,
    files: trackedFiles(root),
    parseYaml: yamlDocuments,
  });
}

function summary(findings) {
  return findings.map(({ path, identity, location }) => {
    const [, , label, form] = identity.split('|');
    return `${path}:${String(location.line)} ${label} ${form}`;
  });
}

const PETCLINIC_REST = {
  'src/main/java/app/model/Owner.java': [
    'package app.model;',
    '@Entity',
    '@Table(name = "owners")',
    'public class Owner extends Person {',
    '    @Column(name = "telephone")',
    '    @NotNull',
    '    @Digits(fraction = 0, integer = 10)',
    '    @Pattern(regexp = "^[0-9]{10}$")',
    '    private String telephone;',
    '}',
    '',
  ].join('\n'),
  'src/main/java/app/rest/OwnerRestController.java': [
    '@RestController',
    'class OwnerRestController {',
    '    @PostMapping("/owners")',
    '    ResponseEntity<OwnerDto> add(@RequestBody OwnerFieldsDto fields) { return null; }',
    '}',
    '',
  ].join('\n'),
  'src/main/resources/db/h2/schema.sql':
    'CREATE TABLE owners (\n  id INTEGER,\n  telephone VARCHAR(20)\n);\n',
  'src/main/resources/db/postgres/schema.sql':
    'CREATE TABLE owners (\n  id SERIAL,\n  telephone VARCHAR(20)\n);\n',
  'src/main/resources/openapi.yml': [
    'openapi: 3.0.1',
    'components:',
    '  schemas:',
    '    OwnerFields:',
    '      type: object',
    '      properties:',
    '        telephone:',
    '          type: string',
    '          minLength: 1',
    '          maxLength: 20',
    "          pattern: '^[0-9]*$'",
    '',
  ].join('\n'),
};

const OWNER = 'src/main/java/app/model/Owner.java';
const CONTROLLER = 'src/main/java/app/rest/OwnerRestController.java';
const SCHEMA = 'src/main/resources/db/h2/schema.sql';
const SPEC = 'src/main/resources/openapi.yml';

function owner(annotations) {
  return [
    '@Entity',
    '@Table(name = "owners")',
    'public class Owner {',
    ...annotations.map((line) => `    ${line}`),
    '    private String name;',
    '}',
    '',
  ].join('\n');
}

function spec(properties) {
  return [
    'openapi: 3.0.1',
    'components:',
    '  schemas:',
    '    OwnerFields:',
    '      type: object',
    '      properties:',
    '        name:',
    '          type: string',
    ...properties.map((line) => `          ${line}`),
    '',
  ].join('\n');
}

const TABLE = 'CREATE TABLE owners (\n  id INTEGER,\n  name VARCHAR(30)\n);\n';
const BINDING =
  '@RestController\nclass OwnerRestController {\n  @PostMapping("/o") void add(@RequestBody Owner owner) {}\n}\n';

describe('field limits that disagree', () => {
  it('reports the petclinic-rest shape: a spec that disagrees with the validation', () => {
    const findings = check(PETCLINIC_REST);

    expect(summary(findings)).toEqual([
      'src/main/resources/openapi.yml:7 OwnerFields.telephone spec',
    ]);
    expect(findings[0].message).toBe(
      'src/main/resources/openapi.yml: OwnerFields.telephone (line 7) disagrees with Owner.telephone (src/main/java/app/model/Owner.java:9): maximum length 20 in the spec and 10 in the validation; minimum length 1 in the spec and 10 in the validation. The published contract and the server must state the same bounds; change the one that is wrong. An exception fits a field whose input is limited elsewhere (a constant, a custom validator, a gateway). If this is intended, add {"rule":"field-limit-mismatch","paths":["src/main/resources/openapi.yml"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports a column with no validation bound when the entity is bound from a request', () => {
    const findings = check({
      [OWNER]: owner(['@NotBlank']),
      [CONTROLLER]: BINDING,
      [SCHEMA]: TABLE,
    });

    expect(summary(findings)).toEqual([`${OWNER}:5 Owner.name unbounded`]);
    expect(findings[0].message).toBe(
      'src/main/java/app/model/Owner.java: Owner.name (line 5) is bound from a request and stored in a 30-character column (src/main/resources/db/h2/schema.sql:2), but nothing limits it to 30 characters, so a longer value fails at the database (a 500) instead of being rejected as invalid input. Add @Size(max = 30). An exception fits a field whose input is limited elsewhere (a constant, a custom validator, a gateway). If this is intended, add {"rule":"field-limit-mismatch","paths":["src/main/java/app/model/Owner.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports a validation bound above the column and a Spring validator check', () => {
    const loose = check({ [OWNER]: owner(['@Size(max = 50)']), [SCHEMA]: TABLE });
    const validator = check({
      'src/main/java/app/PetValidator.java': [
        'public class PetValidator implements Validator {',
        '  public boolean supports(Class<?> c) { return Pet.class.isAssignableFrom(c); }',
        '  public void validate(Object target, Errors errors) {',
        '    Pet pet = (Pet) target;',
        '    String name = pet.getName();',
        '    if (name.length() > 50) { errors.rejectValue("name", "tooLong"); }',
        '  }',
        '}',
        '',
      ].join('\n'),
      'src/main/resources/db/schema.sql': 'CREATE TABLE pets (name VARCHAR(30));\n',
    });

    expect(summary(loose)).toEqual([`${OWNER}:5 Owner.name loose`]);
    expect(loose[0].message).toBe(
      'src/main/java/app/model/Owner.java: Owner.name (line 5) admits up to 50 characters but the column (src/main/resources/db/h2/schema.sql:2) holds 30, so a value of 31 to 50 characters passes validation and fails at the database. Lower the bound to 30 (@Size(max = 30)) or widen the column in a migration. An exception fits a field whose input is limited elsewhere (a constant, a custom validator, a gateway). If this is intended, add {"rule":"field-limit-mismatch","paths":["src/main/java/app/model/Owner.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(summary(validator)).toEqual(['src/main/java/app/PetValidator.java:6 Pet.name loose']);
  });

  it('reads Flyway migrations in order and Kotlin entities', () => {
    const findings = check({
      'src/main/kotlin/Pet.kt':
        '@Entity\n@Table(name = "pets")\nclass Pet(\n  @Size(max = 40) val name: String,\n)\n',
      'src/main/kotlin/PetController.kt':
        '@RestController\nclass C { @PostMapping fun add(@RequestBody pet: Pet) {} }\n',
      'src/main/resources/db/migration/V1__pets.sql': 'create table pets (name varchar(100));\n',
      'src/main/resources/db/migration/V2__narrow.sql':
        'alter table pets alter column name type varchar(30);\n',
    });

    expect(summary(findings)).toEqual(['src/main/kotlin/Pet.kt:4 Pet.name loose']);
  });

  it('counts the spec of a generated DTO as the validation and compares it with the column', () => {
    const generated = {
      'build.gradle': "plugins { id 'org.openapi.generator' }\ntask x { openApiGenerate }\n",
    };
    const loose = check({ ...generated, [SPEC]: spec(['maxLength: 50']), [SCHEMA]: TABLE });
    const open = check({
      ...generated,
      [SPEC]: spec([]),
      [SCHEMA]: TABLE,
      [CONTROLLER]: 'class C { @PostMapping void a(@RequestBody OwnerFieldsDto o) {} }',
    });

    expect(summary(loose)).toEqual([`${SPEC}:7 OwnerFields.name loose`]);
    expect(summary(open)).toEqual([`${SPEC}:7 OwnerFields.name unbounded`]);
  });

  it('does not report a column wider than its validation, an unbound entity or matching limits', () => {
    expect(
      check({ [OWNER]: owner(['@Size(max = 20)']), [CONTROLLER]: BINDING, [SCHEMA]: TABLE }),
    ).toEqual([]);
    expect(check({ [OWNER]: owner(['@NotBlank']), [SCHEMA]: TABLE })).toEqual([]);
    expect(
      check({
        [OWNER]: owner(['@Size(max = 30)']),
        [SCHEMA]: TABLE,
        [SPEC]: spec(['maxLength: 30']),
      }),
    ).toEqual([]);
    expect(
      check({ [OWNER]: owner(['@Size(max = LIMIT)']), [CONTROLLER]: BINDING, [SCHEMA]: TABLE }),
    ).toEqual([]);
    expect(
      check({ [OWNER]: owner(['@Size(max = 30)']), [SCHEMA]: TABLE, [SPEC]: spec([]) }),
    ).toEqual([]);
  });

  it('reports TypeScript and JavaScript stacks: Prisma, TypeORM, Drizzle with zod and class-validator', () => {
    const findings = check({
      'prisma/schema.prisma':
        'model User {\n  id Int @id\n  name String @db.VarChar(30)\n  nick String @db.VarChar(10)\n}\n',
      'src/user.schema.ts':
        'export const createUserSchema = z.object({\n  name: z.string().max(60),\n  nick: z.string().min(1),\n});\n',
      'src/user.controller.ts': 'router.post("/u", (req) => createUserSchema.parse(req.body));\n',
      'src/entity/Account.ts':
        "@Entity('accounts')\nexport class Account {\n  @Column({ length: 20 })\n  @MaxLength(40)\n  title!: string;\n}\n",
      'src/db/schema.js':
        "export const pets = pgTable('pets', {\n  name: varchar('name', { length: 15 }),\n});\n",
      'src/pets.js': 'const petSchema = z.object({ name: z.string().max(25) });\n',
    });

    expect(summary(findings).sort()).toEqual([
      'prisma/schema.prisma:4 User.nick unbounded',
      'src/entity/Account.ts:5 Account.title loose',
      'src/pets.js:1 petSchema.name loose',
      'src/user.schema.ts:2 createUserSchema.name loose',
    ]);
  });

  it('reports Python stacks: SQLAlchemy with pydantic, and Alembic columns', () => {
    const findings = check({
      'app/models.py':
        'class User(Base):\n    __tablename__ = "users"\n    name: Mapped[str] = mapped_column(String(30))\n    nick = Column(String(10))\n',
      'app/schemas.py':
        'class UserCreate(BaseModel):\n    name: str = Field(max_length=60)\n    nick: str\n',
      'app/routes.py': '@router.post("/users")\ndef add(user: UserCreate): ...\n',
      'migrations/versions/0001_pets.py':
        "def upgrade():\n    op.create_table('pets', sa.Column('name', sa.String(length=12)))\n",
      'app/pets.py': 'class PetCreate(BaseModel):\n    name: constr(max_length=40)\n',
    });

    expect(summary(findings).sort()).toEqual([
      'app/models.py:4 User.nick unbounded',
      'app/pets.py:2 PetCreate.name loose',
      'app/schemas.py:2 UserCreate.name loose',
    ]);
  });

  it('reports Go structs with gorm size and validate tags', () => {
    const findings = check({
      'internal/owner.go':
        'package owner\n\ntype Owner struct {\n\tName string `gorm:"size:30" validate:"max=50"`\n\tNick string `gorm:"size:10"`\n\tCity string `gorm:"size:40" validate:"max=20"`\n}\n',
      'internal/handler.go':
        'package owner\n\nfunc Add(c *gin.Context) { var o Owner; c.ShouldBindJSON(&o) }\n',
    });

    expect(summary(findings).sort()).toEqual([
      'internal/owner.go:4 Owner.Name loose',
      'internal/owner.go:5 Owner.Nick unbounded',
    ]);
  });

  it('keeps the fields apart by a change of their limits in the identity', () => {
    const before = check({ [OWNER]: owner(['@Size(max = 50)']), [SCHEMA]: TABLE });
    const after = check({
      [OWNER]: owner(['@Size(max = 50)']),
      [SCHEMA]: TABLE.replace('30', '20'),
    });

    expect(before[0].identity).not.toBe(after[0].identity);
  });

  it('skips columns that are not bounded or never written, and reads an implicitly anchored pattern', () => {
    const skipped = [
      '@Column(length = 30, columnDefinition = "TEXT")',
      '@Lob @Column(length = 30)',
      '@Column(length = 30, insertable = false, updatable = false)',
    ].map((annotation) => check({ [OWNER]: owner([annotation]), [CONTROLLER]: BINDING }));
    const pattern = check({
      [OWNER]: owner(['@Pattern(regexp = "\\\\d{3}-\\\\d{4}")']),
      [SCHEMA]: 'CREATE TABLE owners (name VARCHAR(5));\n',
    });

    expect(skipped).toEqual([[], [], []]);
    expect(summary(pattern)).toEqual([`${OWNER}:5 Owner.name loose`]);
    expect(pattern[0].message).toBe(
      'src/main/java/app/model/Owner.java: Owner.name (line 5) admits up to 8 characters but the column (src/main/resources/db/h2/schema.sql:1) holds 5, so a value of 6 to 8 characters passes validation and fails at the database. Lower the bound to 5 (@Size(max = 5)) or widen the column in a migration. An exception fits a field whose input is limited elsewhere (a constant, a custom validator, a gateway). If this is intended, add {"rule":"field-limit-mismatch","paths":["src/main/java/app/model/Owner.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });
});
