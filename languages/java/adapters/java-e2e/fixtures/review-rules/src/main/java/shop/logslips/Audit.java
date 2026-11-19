package shop.logslips;

import java.io.IOException;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;
import org.slf4j.MarkerFactory;

public class Audit {
  private static final org.slf4j.Logger LOG = LoggerFactory.getLogger(Audit.class);
  private static final Logger AUDIT = LogManager.getLogger(Audit.class);
  private static final Logger FORMATTED = LogManager.getFormatterLogger(Audit.class);
  private static final java.util.logging.Logger JUL =
      java.util.logging.Logger.getLogger(Audit.class.getName());
  private static final Marker SECURITY = MarkerFactory.getMarker("SECURITY");

  public void closed(String id, IOException e) {
    LOG.error("Failed to close producer: {}", e); // violation: LogPlaceholderSlip
    LOG.warn("Failed for {} due to {}", id, e); // violation: LogPlaceholderSlip
    AUDIT.error("Failed paxos prepare locally : {}", e); // violation: LogPlaceholderSlip
    LOG.error(SECURITY, "Failed for {} due to {}", id, e); // violation: LogPlaceholderSlip
  }

  public void caught(String id) {
    try {
      Thread.sleep(1);
    } catch (InterruptedException ex) {
      LOG.info("Interrupted {}", ex); // violation: LogPlaceholderSlip
      Thread.currentThread().interrupt();
    }
  }

  public void looked(String name, int count, long millis) {
    LOG.debug("Looking up named query %s", name); // violation: LogPlaceholderSlip
    AUDIT.info("Initialized in %d ms", millis); // violation: LogPlaceholderSlip
    LOG.info("Found {0} rows for {1}", count, name); // violation: LogPlaceholderSlip
    LOG.info("Took %.2f s", millis / 1000.0); // violation: LogPlaceholderSlip
  }

  public void fine(String id, IOException e, int count) {
    LOG.error("Failed to close producer", e);
    LOG.error("Failed for {}", id, e);
    LOG.error("Failed for {}: {}", id, e.getMessage());
    LOG.error("Failed for {} {}", id, e.getClass().getSimpleName(), e);
    LOG.error(SECURITY, "Failed for {}", id, e);
    LOG.info("Looking up named query {}", id);
    LOG.info("Done in 100%");
    LOG.info("Loaded");
    LOG.info("Escaped \\{} and {}", id);
    LOG.info("Rate is 50% and {}", id);
    LOG.info("Encoded %2F path {}", id);
    LOG.info("Count {}", count);
    String query = String.format("Looking up named query %s", id);
    LOG.info(query);
    AUDIT.info("Failed for {}", id, e);
    FORMATTED.info("Looking up named query %s", id);
    FORMATTED.info("Initialized in %d ms", count);
    String done = String.format("Initialized in %d ms", count);
    JUL.info(done);
    JUL.log(java.util.logging.Level.INFO, "Looking up {0}", id);
    LOG.info("Looking up named query %s", new Object[] {id});
  }
}
