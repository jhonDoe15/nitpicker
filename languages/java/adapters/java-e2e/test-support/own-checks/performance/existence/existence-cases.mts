const MAIN = 'src/main/java/demo';
const EXISTS_BY_ID = 'if (repo.existsById(id)) {}';
const CHECK = 'EntityLoadedForExistence';

const IMPORTS = `import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
`;

const REPOSITORY = `  @Entity
  static class Account {
    @Id Long id;
    String login;
  }

  interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findOneByLogin(String login);
    boolean existsByLogin(String login);
    Account findByLoginAndId(String login, Long id);
    boolean existsByLoginAndId(String login, Long id);
    long countByLogin(String login);
    Optional<Account> findByLoginOrderById(String login);
    boolean existsByLoginOrderById(String login);
    Optional<Account> findFirstByLoginOrderByIdDesc(String login);
    Optional<Account> findActiveByLoginStartingWith(String login);
    boolean existsByLoginStartingWith(String login);
    long countByLoginStartingWith(String login);
    Optional<Account> findByLoginIgnoreCase(String login);
    List<Account> findByLoginIn(List<String> logins);
    Optional<Account> findByLoginContaining(String login);
    @Query("select a from Account a where a.login = ?1")
    Optional<Account> findByLoginQuery(String login);
    boolean existsByLoginQuery(String login);
    Optional<Account> findById2(Long id);
  }

  interface Fragment {
    Optional<Account> findByLogin(String login);
  }

  interface Fragmented extends Fragment, JpaRepository<Account, Long> {
    boolean existsByLogin(String login);
  }

  interface Defaulted extends JpaRepository<Account, Long> {
    default Optional<Account> findByLogin(String login) {
      return Optional.empty();
    }

    boolean existsByLogin(String login);
  }

  AccountRepository repo;
  Fragmented fragmented;
  Defaulted defaulted;
`;

type Shape = {
  readonly name: string;
  readonly before: readonly string[];
  readonly after: readonly string[];
};

function head(name: string): string {
  return `package demo;\n\n${IMPORTS}\npublic class ${name} {\n${REPOSITORY}\n  void shapes(Long id, String login) {\n`;
}

const TAIL = '  }\n\n  void consume(boolean value) {\n    System.out.println(value);\n  }\n}\n';
const STORED = /^boolean \w+ = (.*);$/u;

function statements(lines: readonly string[]): string {
  return `${lines.map((line) => `    ${line.replace(STORED, 'consume($1);')}`).join('\n')}\n`;
}

function build({ name, before, after }: Shape) {
  const prefix = head(name);
  const first = before.findIndex((line, index) => line !== after[index]);
  return {
    check: CHECK,
    file: `${MAIN}/${name}.java`,
    before: `${prefix}${statements(before)}${TAIL}`,
    after: `${prefix}${statements(after)}${TAIL}`,
    lines: first < 0 ? [] : [prefix.split('\n').length + first],
  };
}

const LOADED: Shape = {
  name: 'ExistenceLoaded',
  before: [
    'if (repo.findById(id).isPresent()) {}',
    'if (repo.findById(id).isEmpty()) {}',
    'if (repo.findById(id).orElse(null) != null) {}',
    'if (repo.findById(id).orElse(null) == null) {}',
    'if (null != repo.findById(id).orElse(null)) {}',
    'boolean a = repo.findById(id).isPresent() && repo.findOneByLogin(login.toLowerCase()).isPresent();',
  ],
  after: [
    EXISTS_BY_ID,
    'if (!repo.existsById(id)) {}',
    EXISTS_BY_ID,
    'if (!repo.existsById(id)) {}',
    EXISTS_BY_ID,
    'boolean a = repo.existsById(id) && repo.existsByLogin(login.toLowerCase());',
  ],
};

const DERIVED: Shape = {
  name: 'ExistenceDerived',
  before: [
    'boolean a = repo.findByLoginAndId(login, id) != null;',
    'boolean b = repo.findByLoginAndId(login, id) == null;',
    'boolean c = repo.findActiveByLoginStartingWith(login).isEmpty();',
    'boolean d = repo.findByLoginOrderById(login).isPresent();',
    'boolean e = repo.findOneByLogin(login).orElse(null) == null;',
  ],
  after: [
    'boolean a = repo.existsByLoginAndId(login, id);',
    'boolean b = !repo.existsByLoginAndId(login, id);',
    'boolean c = !repo.existsByLoginStartingWith(login);',
    'boolean d = repo.existsByLoginOrderById(login);',
    'boolean e = !repo.existsByLogin(login);',
  ],
};

const COUNTED: Shape = {
  name: 'ExistenceCounted',
  before: [
    'boolean a = repo.countByLogin(login) > 0;',
    'boolean b = repo.countByLogin(login) == 0;',
    'boolean c = 0 < repo.countByLogin(login);',
    'boolean d = repo.countByLogin(login) >= 1;',
    'boolean e = repo.countByLogin(login) < 1;',
    'boolean f = repo.countByLoginStartingWith(login) != 0L;',
    'boolean g = 1 > repo.countByLogin(login);',
  ],
  after: [
    'boolean a = repo.existsByLogin(login);',
    'boolean b = !repo.existsByLogin(login);',
    'boolean c = repo.existsByLogin(login);',
    'boolean d = repo.existsByLogin(login);',
    'boolean e = !repo.existsByLogin(login);',
    'boolean f = repo.existsByLoginStartingWith(login);',
    'boolean g = !repo.existsByLogin(login);',
  ],
};

const MERGED: Shape = {
  name: 'ExistenceForms',
  before: [LOADED, DERIVED, COUNTED].flatMap(({ before }) => ['{', ...before, '}']),
  after: [LOADED, DERIVED, COUNTED].flatMap(({ after }) => ['{', ...after, '}']),
};

const DECLINED_FINDERS: Shape = {
  name: 'ExistenceDeclinedFinders',
  before: [
    'boolean a = repo.findFirstByLoginOrderByIdDesc(login).isPresent();',
    'boolean b = repo.findByLoginQuery(login).isPresent();',
    'boolean c = repo.findByLoginIgnoreCase(login).isPresent();',
    'boolean d = repo.findByLoginIn(List.of(login)).isEmpty();',
    'boolean e = repo.findByLoginContaining(login).isPresent();',
    'boolean f = fragmented.findByLogin(login).isPresent();',
    'boolean g = defaulted.findByLogin(login).isPresent();',
    'boolean h = repo.findById2(id).isPresent();',
    'boolean i = repo.findAll().isEmpty();',
    'boolean j = repo.findAll() == null;',
  ],
  after: [
    'boolean a = repo.findFirstByLoginOrderByIdDesc(login).isPresent();',
    'boolean b = repo.findByLoginQuery(login).isPresent();',
    'boolean c = repo.findByLoginIgnoreCase(login).isPresent();',
    'boolean d = repo.findByLoginIn(List.of(login)).isEmpty();',
    'boolean e = repo.findByLoginContaining(login).isPresent();',
    'boolean f = fragmented.findByLogin(login).isPresent();',
    'boolean g = defaulted.findByLogin(login).isPresent();',
    'boolean h = repo.findById2(id).isPresent();',
    'boolean i = repo.findAll().isEmpty();',
    'boolean j = repo.findAll() == null;',
  ],
};

const DECLINED_USES: Shape = {
  name: 'ExistenceDeclinedUses',
  before: [
    'Optional<Account> kept = repo.findById(id);',
    'boolean a = kept.isPresent();',
    'Account loaded = repo.findOneByLogin(login).orElse(null);',
    'boolean b = loaded != null;',
    'boolean c = repo.findById(id).orElse(new Account()) != null;',
    'boolean d = repo.countByLogin(login) > 1;',
    'boolean e = repo.countByLogin(login) == 2;',
    'boolean f = repo.count() > 0;',
    'boolean g = repo.findById(id).map(found -> found.login).isPresent();',
    'long total = repo.countByLogin(login);',
    'boolean h = total > 0;',
  ],
  after: [
    'Optional<Account> kept = repo.findById(id);',
    'boolean a = kept.isPresent();',
    'Account loaded = repo.findOneByLogin(login).orElse(null);',
    'boolean b = loaded != null;',
    'boolean c = repo.findById(id).orElse(new Account()) != null;',
    'boolean d = repo.countByLogin(login) > 1;',
    'boolean e = repo.countByLogin(login) == 2;',
    'boolean f = repo.count() > 0;',
    'boolean g = repo.findById(id).map(found -> found.login).isPresent();',
    'long total = repo.countByLogin(login);',
    'boolean h = total > 0;',
  ],
};

export const EXISTENCE_CASES = [MERGED, DECLINED_FINDERS, DECLINED_USES].map(build);
