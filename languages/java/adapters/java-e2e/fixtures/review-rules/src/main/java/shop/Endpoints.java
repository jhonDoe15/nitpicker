package shop;

import java.net.URI;

public final class Endpoints {
  private Endpoints() {}

  public static String hostName(String host) {
    return host.split(":")[0]; // violation: HostPortColonSplit
  }

  public static String authority(String authority) {
    return authority.substring(0, authority.indexOf(":")); // violation: HostPortColonSplit
  }

  public static String bracketed(String host) {
    if (host.startsWith("[")) {
      return host.substring(0, host.indexOf(']') + 1);
    }
    return host.split(":")[0];
  }

  public static String parsed(String host) {
    return URI.create("http://" + host).getHost();
  }

  public static String other(String line) {
    return line.split(":")[0];
  }
}
