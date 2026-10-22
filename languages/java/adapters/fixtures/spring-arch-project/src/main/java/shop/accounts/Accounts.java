package shop.accounts;

import jakarta.servlet.http.HttpServletResponse;
import java.sql.Connection;
import javax.sql.DataSource;
import org.springframework.http.ResponseEntity;

public class Accounts {
  private final DataSource source;

  public Accounts(DataSource source) {
    this.source = source;
  }

  public static Accounts of(DataSource source) {
    return new Accounts(source);
  }

  public HttpServletResponse respond(String body) {
    return null;
  }

  public ResponseEntity<AccountView> view() {
    return ResponseEntity.ok(new AccountView(1L, String.valueOf(source)));
  }

  public AccountView view(long id) {
    return new AccountView(id, "");
  }

  public static final class Batch {
    public void run(Connection connection) {}
  }
}
