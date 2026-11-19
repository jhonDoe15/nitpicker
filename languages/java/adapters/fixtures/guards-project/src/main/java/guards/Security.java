package guards;

import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Collections;
import java.util.List;

public final class Security {
  private static final List<String> COLUMNS = List.of("id", "name");

  public void find(Statement statement, String name) throws SQLException {
    statement.executeQuery("select * from users where name = '" + name + "'"); // violation: pmd/SqlConcatenation
  }

  public void findSafely(Connection connection, String name) throws SQLException {
    try (var query = connection.prepareStatement("select * from users where name = ?")) {
      query.setString(1, name);
      query.executeQuery();
    }
  }

  public void insertFixedColumns(Connection connection, long id) throws SQLException {
    String columns = String.join(",", COLUMNS);
    String marks = String.join(",", Collections.nCopies(COLUMNS.size(), "?"));
    try (var query = connection.prepareStatement("insert into users (" + columns + ") values (" + marks + ")")) {
      query.setLong(1, id);
      query.executeUpdate();
    }
  }

  public void findByType(Statement statement, long id) throws SQLException {
    statement.executeQuery("select * from " + Security.class.getSimpleName() + " where id = " + id);
  }

  public void findByShouted(Statement statement, String column) throws SQLException {
    String ORDER = column;
    statement.executeQuery("select * from users order by " + ORDER); // violation: pmd/SqlConcatenation
  }

  public void findByConstant(Statement statement) throws SQLException {
    final String ORDER = "name";
    statement.executeQuery("select * from users order by " + ORDER);
  }

  public void findByColumn(Statement statement, String column) throws SQLException {
    statement.executeQuery("select " + column + " from users"); // violation: pmd/SqlConcatenation
  }

  public MessageDigest digest() throws NoSuchAlgorithmException {
    return MessageDigest.getInstance("MD5"); // violation: pmd/WeakHash
  }

  public MessageDigest strongDigest() throws NoSuchAlgorithmException {
    return MessageDigest.getInstance("SHA-256");
  }

  public boolean words(String text) {
    return text.matches("(a+)+") // violation: pmd/NestedQuantifierRegex
        || text.matches("([A-Z][a-z]+)+")
        || text.matches("(\\s*,\\s*)*");
  }

  public boolean repeated(String text) {
    return text.matches("(\\w+\\s?)+") // violation: pmd/NestedQuantifierRegex
        || text.matches("(a|aa)+") // violation: pmd/NestedQuantifierRegex
        || text.matches("(\\w+\\s)+")
        || text.matches("(a|b)+");
  }

  public Path withSuffix(String name) {
    return Path.of("/data").resolve(name + ".txt"); // violation: pmd/PathFromParameter
  }

  public Path prefixed(String name) {
    if (name.startsWith("x")) {
      return null;
    }
    return Path.of("/data", name); // violation: pmd/PathFromParameter
  }

  public Path open(String name) {
    return Path.of("/data", name); // violation: pmd/PathFromParameter
  }

  public Path settings() {
    return under("settings.yml");
  }

  private static Path under(String name) {
    return Path.of("/data", name);
  }

  public Path openInside(String name) {
    Path base = Path.of("/data");
    Path resolved = base.resolve(name).normalize();
    if (!resolved.startsWith(base)) {
      throw new IllegalArgumentException(name);
    }
    return resolved;
  }
}
