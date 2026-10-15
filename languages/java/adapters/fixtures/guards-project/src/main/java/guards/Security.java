package guards;

import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

public final class Security {
  public void find(Statement statement, String name) throws SQLException {
    statement.executeQuery("select * from users where name = '" + name + "'"); // violation: pmd/SqlConcatenation
  }

  public void findSafely(Connection connection, String name) throws SQLException {
    try (var query = connection.prepareStatement("select * from users where name = ?")) {
      query.setString(1, name);
      query.executeQuery();
    }
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

  public Path open(String name) {
    return Path.of("/data", name); // violation: pmd/PathFromParameter
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
