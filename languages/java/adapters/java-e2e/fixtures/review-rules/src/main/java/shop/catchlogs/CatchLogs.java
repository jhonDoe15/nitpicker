package shop.catchlogs;

import java.io.IOException;
import java.util.logging.Level;
import org.apache.logging.log4j.LogManager;
import org.jboss.logging.Logger;
import org.slf4j.LoggerFactory;

public final class CatchLogs {
  private static final org.slf4j.Logger SLF4J = LoggerFactory.getLogger(CatchLogs.class);
  private static final org.apache.logging.log4j.Logger LOG4J = LogManager.getLogger(CatchLogs.class);
  private static final java.util.logging.Logger JUL =
      java.util.logging.Logger.getLogger(CatchLogs.class.getName());
  private static final System.Logger SYSTEM = System.getLogger("shop");
  private static final Logger JBOSS = Logger.getLogger(CatchLogs.class);

  private CatchLogs() {}

  static void banned(String id) {
    try {
      read(id);
    } catch (IOException e) {
      SLF4J.warn("could not load {}", id); // violation: CatchLogWithoutException
      SLF4J.error("could not load " + e.getMessage()); // violation: CatchLogWithoutException
      LOG4J.error("could not load {}", id); // violation: CatchLogWithoutException
      JUL.warning("could not load"); // violation: CatchLogWithoutException
      JUL.log(Level.SEVERE, "could not load"); // violation: CatchLogWithoutException
      SYSTEM.log(System.Logger.Level.ERROR, "could not load"); // violation: CatchLogWithoutException
      JBOSS.warnf("could not load %s", id); // violation: CatchLogWithoutException
      JBOSS.error("could not load"); // violation: CatchLogWithoutException
    }
  }

  static void allowed(String id) {
    try {
      read(id);
    } catch (IOException e) {
      SLF4J.warn("could not load {}", id, e);
      SLF4J.info("could not load {}", id);
      LOG4J.error("could not load {}", id, e);
      JUL.log(Level.SEVERE, "could not load", e);
      SYSTEM.log(System.Logger.Level.ERROR, "could not load", e);
      JBOSS.warnf(e, "could not load %s", id);
      JBOSS.error("could not load", e);
      SLF4J.error("could not load", new IllegalStateException(id, e));
      SLF4J.error("could not load", (Object) e);
    }
  }

  static void expected(String id) {
    try {
      read(id);
    } catch (IOException ignored) {
      SLF4J.warn("could not load {}", id);
    }
  }

  static void rethrown(String id) {
    try {
      read(id);
    } catch (IOException e) {
      SLF4J.warn("could not load {}", id);
      throw new IllegalStateException(id, e);
    }
  }

  private static void read(String id) throws IOException {
    if (id.isEmpty()) {
      throw new IOException(id);
    }
  }
}
