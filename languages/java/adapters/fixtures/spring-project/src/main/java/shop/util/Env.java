package shop.util;

import java.util.Map;

public final class Env {
  private Env() {}

  public static boolean ci() {
    return System.getenv("CI") != null; // violation: SpringTypedConfiguration
  }

  public static String region() {
    return System.getenv().get("REGION"); // violation: SpringTypedConfiguration
  }

  public static String mode() {
    return System.getProperty("app.mode", "dev"); // violation: SpringTypedConfiguration
  }

  public static Map<String, String> inherited() {
    return System.getenv();
  }

  public static String trustStore() {
    return System.getProperty("javax.net.ssl.trustStore");
  }

  public static String proxy() {
    return System.getProperty("https.proxyHost");
  }

  public static String tls() {
    return System.getProperty("jdk.tls.client.protocols");
  }

  public static String arch() {
    return System.getProperty("sun.arch.data.model");
  }
}
