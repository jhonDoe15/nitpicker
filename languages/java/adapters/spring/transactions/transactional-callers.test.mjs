import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects } from '../test-support/spring-config-projects.mjs';
import { withSpringTransactionFilters } from './transaction-filters.mjs';
import { withoutTransactionalCallers } from './transactional-callers.mjs';

const REPOSITORY = 'src/main/java/shop/JdbcPetRepository.java';
const INTERFACE = 'src/main/java/shop/PetRepository.java';
const CLIENT = 'src/main/java/shop/Clinic.java';
const RULE = 'SpringMultiWriteWithoutTransaction';

const repository = `package shop;
@Repository
public class JdbcPetRepository implements PetRepository {
  @Override
  public void delete(Pet pet) {
    visits.deleteAll(pet);
    pets.delete(pet);
  }
}
`;
const contract = 'package shop;\npublic interface PetRepository {\n  void delete(Pet pet);\n}\n';

function clinic(body, header = '@Service\npublic class Clinic') {
  return `package shop;\n${header} {\n  private final PetRepository repository;\n${body}\n}\n`;
}

function reported(files, line = 4, path = REPOSITORY) {
  const root = project(
    { [REPOSITORY]: repository, [INTERFACE]: contract, ...files },
    { jpa: false },
  );
  return withoutTransactionalCallers([{ tool: 'pmd', rule: RULE, path, location: { line } }], {
    projectRoot: root,
    roots: ['src/main/java', 'src/main/kotlin'],
  }).length;
}

afterEach(removeProjects);

describe('multi-write findings on a method whose callers all run in a transaction', () => {
  it('drops the finding when every caller, found through the interface, is @Transactional', () => {
    expect(
      reported({
        [CLIENT]: clinic(
          '  @Transactional\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }',
        ),
        'src/main/java/shop/Cleanup.java': clinic(
          '  @Transactional(rollbackFor = Exception.class)\n  public void purge(Pet pet) {\n    repository.delete(pet);\n  }',
          '@Service\npublic class Cleanup',
        ),
      }),
    ).toBe(0);
  });

  it.each([
    [
      'a @Transactional class',
      '  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }',
      '@Service\n@Transactional\npublic class Clinic',
    ],
    [
      'a transaction template block',
      '  private TransactionTemplate template;\n  public void deletePet(Pet pet) {\n    template.execute(status -> {\n      repository.delete(pet);\n      return null;\n    });\n  }',
    ],
    [
      'a transaction template expression',
      '  private TransactionTemplate runner;\n  public void deletePet(Pet pet) {\n    runner.executeWithoutResult(status -> repository.delete(pet));\n  }',
    ],
  ])('drops the finding for a caller in %s', (_name, body, header) => {
    expect(reported({ [CLIENT]: clinic(body, header) })).toBe(0);
  });

  it('keeps the finding when any caller is not transactional', () => {
    expect(
      reported({
        [CLIENT]: clinic(
          '  @Transactional\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }',
        ),
        'src/main/java/shop/PetController.java': clinic(
          '  public void remove(Pet pet) {\n    repository.delete(pet);\n  }',
          '@RestController\npublic class PetController',
        ),
      }),
    ).toBe(1);
  });

  it('keeps the finding with no caller in the project, or only callers outside main sources', () => {
    expect(reported({})).toBe(1);
    expect(
      reported({
        'src/test/java/shop/ClinicTest.java': clinic(
          '  @Transactional\n  void deletes(Pet pet) {\n    repository.delete(pet);\n  }',
          'class ClinicTest',
        ),
      }),
    ).toBe(1);
  });

  it.each([
    ['NOT_SUPPORTED', 'Propagation.NOT_SUPPORTED'],
    ['NEVER', 'Propagation.NEVER'],
    ['SUPPORTS', 'Propagation.SUPPORTS'],
  ])('keeps the finding for a caller with %s propagation', (_name, propagation) => {
    expect(
      reported({
        [CLIENT]: clinic(
          `  @Transactional(propagation = ${propagation})\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }`,
        ),
      }),
    ).toBe(1);
  });

  it.each([
    [
      'counts a REQUIRES_NEW caller as transactional',
      '  @Transactional(propagation = Propagation.REQUIRES_NEW)\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }',
      0,
    ],
    [
      'keeps the finding when a caller outside any transaction calls from a lambda or helper',
      '  public void deleteAll(List<Pet> pets) {\n    pets.forEach(pet -> repository.delete(pet));\n  }',
      1,
    ],
    [
      'keeps the finding for a call inside an execute of something that is not a transaction',
      '  public void deletePet(Pet pet) {\n    jdbc.execute(connection -> {\n      repository.delete(pet);\n      return null;\n    });\n  }',
      1,
    ],
  ])('%s', (_name, body, expected) => {
    expect(reported({ [CLIENT]: clinic(body) })).toBe(expected);
  });

  it('matches by method name on any receiver, so a same-named call elsewhere keeps the finding', () => {
    expect(
      reported({
        [CLIENT]: clinic(
          '  @Transactional\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }',
        ),
        'src/main/java/shop/Files.java':
          'package shop;\npublic class Files {\n  public void clean(Path path) {\n    path.delete();\n  }\n}\n',
      }),
    ).toBe(1);
  });

  const deletePet = (extra = '', header) =>
    clinic(
      `${extra}  @Transactional\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }`,
      header,
    );
  const other = (body, header = '@Service\npublic class Other') => clinic(body, header);

  it.each([
    '    executor.submit(() -> repository.delete(pet));',
    '    executor.submit(() -> {\n      repository.delete(pet);\n    });',
    '    pets.forEach(repository::delete);',
    '    executor.execute(new Runnable() {\n      public void run() {\n        repository.delete(pet);\n      }\n    });',
  ])(
    'keeps the finding for calls in lambdas, method references and anonymous classes: %s',
    (body) => {
      const inTransaction = `  @Transactional\n  public void run(Pet pet) {\n${body}\n  }`;

      expect(reported({ [CLIENT]: other(inTransaction) })).toBe(1);
    },
  );

  it('identifies a transaction callback by the declared type, not by the variable name', () => {
    const callback = (field, name) =>
      other(
        `${field}  public void run(Pet pet) {\n    ${name}.execute(status -> repository.delete(pet));\n  }`,
      );

    expect(
      reported({ [CLIENT]: callback('  private TransactionTemplate runner;\n', 'runner') }),
    ).toBe(0);
    expect(reported({ [CLIENT]: callback('  private Runner txRunner;\n', 'txRunner') })).toBe(1);
    expect(reported({ [CLIENT]: callback('', 'txTemplate') })).toBe(1);
  });

  it('keeps a lambda nested inside a transaction callback', () => {
    expect(
      reported({
        [CLIENT]: other(
          '  private TransactionTemplate runner;\n  public void run(Pet pet) {\n    runner.execute(status -> {\n      executor.submit(() -> repository.delete(pet));\n      return null;\n    });\n  }',
        ),
      }),
    ).toBe(1);
  });

  it('lets a method-level propagation override a transactional class', () => {
    const body = (propagation) =>
      `  @Transactional(propagation = Propagation.${propagation})\n  public void run(Pet pet) {\n    repository.delete(pet);\n  }`;
    const header = '@Service\n@Transactional\npublic class Clinic';

    expect(reported({ [CLIENT]: clinic(body('NOT_SUPPORTED'), header) })).toBe(1);
    expect(reported({ [CLIENT]: clinic(body('NEVER'), header) })).toBe(1);
    expect(reported({ [CLIENT]: clinic(body('REQUIRED'), header) })).toBe(0);
    expect(
      reported({
        [CLIENT]: clinic(
          '  @Transactional(Transactional.TxType.REQUIRES_NEW)\n  public void run(Pet pet) {\n    repository.delete(pet);\n  }',
          '@Service\n@Transactional(propagation = Propagation.NEVER)\npublic class Clinic',
        ),
      }),
    ).toBe(0);
  });

  describe('jakarta Transactional propagation', () => {
    const jakarta = (arguments_) =>
      `package shop;\nimport jakarta.transaction.Transactional;\n@Service\npublic class Clinic {\n  @Transactional${arguments_}\n  public void run(Pet pet) {\n    repository.delete(pet);\n  }\n}\n`;

    it.each([
      ['(Transactional.TxType.NEVER)', 1],
      ['(value = TxType.NOT_SUPPORTED)', 1],
      ['(TxType.SUPPORTS)', 1],
      ['', 0],
      ['(TxType.REQUIRES_NEW)', 0],
    ])('reads %j', (arguments_, expected) => {
      expect(reported({ [CLIENT]: jakarta(arguments_) })).toBe(expected);
    });
  });

  it('counts calls in any source, after a parenthesis and as Type::name in the declaring file', () => {
    expect(
      reported({
        [CLIENT]: deletePet(),
        'src/main/java/shop/Bulk.java': other(
          '  public void purge(Pet pet, JdbcPetRepository concrete) {\n    if (pet != null) concrete.delete(pet);\n  }',
          'public class Bulk',
        ),
      }),
    ).toBe(1);
    expect(
      reported({
        [CLIENT]: deletePet(),
        'src/main/java/shop/Generic.java': other(
          '  public <R extends Base> void purge(R repo, Pet pet) {\n    repo.delete(pet);\n  }',
          'public class Generic',
        ),
      }),
    ).toBe(1);
    expect(
      reported({
        [REPOSITORY]: repository.replace(
          '}\n}\n',
          '}\n  Consumer<Pet> bound = JdbcPetRepository::delete;\n}\n',
        ),
        [CLIENT]: deletePet(),
      }),
    ).toBe(1);
  });

  it('reads a finding on the annotation line and a call from the same class', () => {
    const own = `package shop;
@Repository
public class JdbcPetRepository implements PetRepository {
  @Override
  public void delete(Pet pet) {
    visits.deleteAll(pet);
    pets.delete(pet);
  }

  public void purge(Pet pet) {
    delete(pet);
  }
}
`;

    expect(
      reported({
        [REPOSITORY]: own,
        [CLIENT]: clinic(
          '  @Transactional\n  public void a(Pet p) {\n    repository.delete(p);\n  }',
        ),
      }),
    ).toBe(1);
  });

  it('reads Kotlin callers', () => {
    const kotlin = (annotation) =>
      `package shop\n@Service\nclass KotlinClinic(private val repository: PetRepository) {\n${annotation}  fun deletePet(pet: Pet) {\n    repository.delete(pet)\n  }\n}\n`;

    expect(reported({ 'src/main/kotlin/shop/KotlinClinic.kt': kotlin('  @Transactional\n') })).toBe(
      0,
    );
    expect(reported({ 'src/main/kotlin/shop/KotlinClinic.kt': kotlin('') })).toBe(1);
  });

  it('runs with the other transaction filters', () => {
    const root = project(
      {
        [REPOSITORY]: repository,
        [INTERFACE]: contract,
        [CLIENT]: clinic(
          '  @Transactional\n  public void deletePet(Pet pet) {\n    repository.delete(pet);\n  }',
        ),
      },
      { jpa: false },
    );
    const findings = [
      { tool: 'pmd', rule: RULE, path: REPOSITORY, location: { line: 4 } },
      {
        tool: 'pmd',
        rule: 'SpringDataWriteWithoutTransaction',
        path: INTERFACE,
        location: { line: 3 },
      },
    ];

    expect(
      withSpringTransactionFilters(findings, {
        projectRoot: root,
        allSourceRoots: ['src/main/java'],
      }).map(({ rule }) => rule),
    ).toEqual(['SpringDataWriteWithoutTransaction']);
  });
});
