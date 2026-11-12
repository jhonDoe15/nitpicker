package shop;

import java.util.logging.Level;
import org.apache.logging.log4j.LogManager;
import org.jboss.logging.Logger;

public final class StockLog {
  private static final Logger LOG = Logger.getLogger(StockLog.class);
  private static final java.util.logging.Logger JUL =
      java.util.logging.Logger.getLogger(StockLog.class.getName());
  private static final org.apache.logging.log4j.Logger FORMATTER =
      LogManager.getFormatterLogger(StockLog.class);

  private StockLog() {}

  public static void restocked(String sku, int count, RuntimeException failure) {
    LOG.infof("restocked %s with %d items, %d%% of capacity", sku, count, count);
    LOG.infov("restocked {0} with {1,number,#} items, it''s done", sku, count);
    LOG.errorf(failure, "restock of %s failed", sku);
    JUL.log(Level.INFO, "restocked {0} with {1}", new Object[] {sku, count});
    FORMATTER.info("restocked %s with %d items", sku, count);
    LOG.logf(Logger.Level.WARN, "restock of %2$s after %1$d tries, %<d in total", count, sku);
    LOG.warnf("restock of %s skipped"); // violation: LogFormatArguments
    LOG.infof("restocked %d", sku); // violation: LogFormatArguments
    LOG.infov("Can't restock {0}", sku); // violation: LogFormatArguments
    LOG.infof("restocked " + sku, count); // violation: LogFormatArguments
    JUL.log(Level.INFO, "restocked {0} with {1}", sku); // violation: LogFormatArguments
    FORMATTER.info("restocked {} with {} items", sku, count); // violation: LogFormatArguments
    LOG.errorf("restock of %s failed", sku, failure); // violation: LogExceptionFirst
  }
}
