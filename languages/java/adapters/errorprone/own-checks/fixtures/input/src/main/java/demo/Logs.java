package demo;

import org.slf4j.Logger;

class Logs {
  private static final Logger LOG = null;

  void run(String user, int n, Exception e) {
    LOG.info("user " + user + " has " + n + " items");
    LOG.error("failed " + user, e);
    LOG.warn(String.format("user %s has %d", user, n));
    LOG.info("fixed text " + 1 + 2);
    LOG.info("with err " + e);
    LOG.info("braces {} " + user);
  }
}
