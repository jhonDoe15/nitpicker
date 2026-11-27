import java.io.InterruptedIOException;
import java.sql.SQLException;

class S38Pmi35 {
  void test(Object e) {
    if (e instanceof InterruptedIOException) {
      test((InterruptedIOException) e);
    } else if (e instanceof SQLException) {
      test((SQLException) e);
    }
  }
}
