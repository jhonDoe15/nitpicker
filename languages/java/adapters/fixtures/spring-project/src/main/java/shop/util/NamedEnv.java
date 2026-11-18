package shop.util;

import jakarta.inject.Named;

@Named
public class NamedEnv {
  public String mode() {
    return System.getenv("APP_MODE"); // violation: SpringTypedConfiguration
  }
}
