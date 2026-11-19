package shop.release;

import java.io.Closeable;
import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.concurrent.Callable;

public final class Rollbacks {
  public interface Completion {
    void deleteComplete(String name);
  }

  private final Closeable executor;
  private final Connection connection;

  public Rollbacks(Closeable executor, Connection connection) {
    this.executor = executor;
    this.connection = connection;
  }

  public boolean execute(Callable<Boolean> command) throws Exception {
    try {
      return command.call();
    } finally {
      executor.close();
    }
  }

  public void commit(Runnable work) throws SQLException {
    try {
      work.run();
      connection.commit();
    } catch (RuntimeException e) {
      connection.rollback(); // violation: CleanupThrowReplacesFailure
      throw e;
    }
  }

  public void commitSuppressed(Runnable work) throws SQLException {
    try {
      work.run();
      connection.commit();
    } catch (RuntimeException e) {
      try {
        connection.rollback();
      } catch (SQLException rollbackFailure) {
        e.addSuppressed(rollbackFailure);
      }
      throw e;
    }
  }

  public boolean executeSuppressed(Callable<Boolean> command) throws Exception {
    boolean result;
    try {
      result = command.call();
    } catch (Exception e) {
      try {
        executor.close();
      } catch (IOException closeFailure) {
        e.addSuppressed(closeFailure);
      }
      throw e;
    }
    executor.close();
    return result;
  }

  public void rollbackAndRecover(Runnable work) throws SQLException {
    try {
      work.run();
    } catch (RuntimeException e) {
      connection.rollback();
    }
  }

  public void readAll(Callable<Closeable> source) throws Exception {
    Closeable stream = source.call();
    try {
      stream.hashCode();
    } finally {
      stream.close();
    }
  }

  public void finish(Completion completion, Runnable work) {
    try {
      work.run();
    } catch (RuntimeException e) {
      completion.deleteComplete("work");
      throw e;
    }
  }
}
