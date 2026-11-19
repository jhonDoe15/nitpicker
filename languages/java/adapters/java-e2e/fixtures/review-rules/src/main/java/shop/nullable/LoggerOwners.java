package shop.nullable;

import java.lang.invoke.MethodHandles;
import org.apache.logging.log4j.LogManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LoggerOwners {
  private static final Logger LOG = LoggerFactory.getLogger(FormInheritance.class);
  private static final org.apache.logging.log4j.Logger AUDIT =
      LogManager.getLogger(UploadDirs.class);
  private static final java.util.logging.Logger JUL =
      java.util.logging.Logger.getLogger(RequestInfo.class.getName());

  private static final Logger OWN = LoggerFactory.getLogger(LoggerOwners.class);
  private static final Logger LOOKUP = LoggerFactory.getLogger(MethodHandles.lookup().lookupClass());
  private static final Logger NAMED = LoggerFactory.getLogger("shop.audit");
  private final Logger perInstance = LoggerFactory.getLogger(getClass());

  public void log(String message) {
    OWN.info(message);
    LOG.info(message);
    AUDIT.info(message);
    JUL.info(message);
    LOOKUP.info(message);
    NAMED.info(message);
    perInstance.info(message);
  }

  public static final class Nested extends LoggerOwners {
    private static final Logger NESTED = LoggerFactory.getLogger(Nested.class);
    private static final Logger OUTER = LoggerFactory.getLogger(LoggerOwners.class);

    public void trace(String message) {
      NESTED.info(message);
      OUTER.info(message);
    }
  }
}

final class ResponseInfoWriter {
  private static final Logger LOG = LoggerFactory.getLogger(ResponseInfoWriter.class);

  void log(String message) {
    LOG.info(message);
  }
}
