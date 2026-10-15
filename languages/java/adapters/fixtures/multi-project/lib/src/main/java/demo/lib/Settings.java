package demo.lib;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Settings {
  private static final Logger LOG = LoggerFactory.getLogger(Settings.class);
  private String name;
  private boolean enabled;

  public Settings name(String name) {
    this.name = name;
    return this;
  }

  public void enabled(boolean enabled) {
    this.enabled = enabled;
  }

  public String name() {
    return name;
  }

  public boolean matches(String text) {
    if ("default".equals(text)) {
      LOG.debug("default {} {}", name, enabled);
      return true;
    }
    LOG.debug("other {}", String.format("%s!", text));
    return false;
  }
}
