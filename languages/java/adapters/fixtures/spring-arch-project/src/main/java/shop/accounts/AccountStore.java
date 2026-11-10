package shop.accounts;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.stereotype.Repository;

@Repository
public class AccountStore {
  private final DataSource source;

  public AccountStore(DataSource source) {
    this.source = source;
  }

  public Connection connection() throws SQLException {
    return source.getConnection();
  }
}
