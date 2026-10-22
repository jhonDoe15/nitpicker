package shop.accounts;

import jakarta.persistence.EntityManager;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Connection;
import java.sql.ResultSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AccountService {
  private final JdbcTemplate jdbc;
  private final AccountRepository repository;

  public AccountService(JdbcTemplate jdbc, AccountRepository repository) {
    this.jdbc = jdbc;
    this.repository = repository;
  }

  public EntityManager entities() {
    return null;
  }

  public Optional<List<ResultSet>> rows(Map<String, Connection[]> byName) {
    return Optional.empty();
  }

  public AccountRepository repository() {
    return repository;
  }

  public String caller(HttpServletRequest request) {
    return request.getRemoteUser();
  }

  public AccountView find(long id) {
    return new AccountView(id, open(null));
  }

  private String open(Connection connection) {
    return String.valueOf(jdbc);
  }
}
