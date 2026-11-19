package shop.logslips;

import org.slf4j.LoggerFactory;

public class JulAudit {
  private static final java.util.logging.Logger log =
      java.util.logging.Logger.getLogger(JulAudit.class.getName());
  private static final org.slf4j.Logger other = LoggerFactory.getLogger(JulAudit.class);

  public void looked(String name) {
    log.log(java.util.logging.Level.INFO, "Looking up {0}", name);
    other.info("Looking up {}", name);
  }
}
