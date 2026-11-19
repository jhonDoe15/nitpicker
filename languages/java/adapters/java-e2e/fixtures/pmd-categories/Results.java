package demo;

import java.sql.ResultSet;
import java.sql.SQLException;

public class Results {
  public String first(ResultSet rows) throws SQLException {
    rows.next();
    return rows.getString("name");
  }

  public void otherGuard(ResultSet rows, ResultSet other) throws SQLException {
    if (!other.next()) { return; }
    do {
      System.out.println(rows.getString("name"));
    } while (rows.next());
  }
}
