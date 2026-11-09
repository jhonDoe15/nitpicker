package shop.accounts;

import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.jdbc.core.RowMapper;

public class AccountRowMapper implements RowMapper<AccountView> {
  @Override
  public AccountView mapRow(ResultSet row, int number) throws SQLException {
    return new AccountView(row.getLong("id"), row.getString("name"));
  }
}
