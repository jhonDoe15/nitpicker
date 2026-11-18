package shop;

public final class Pairs {
  private Pairs() {}

  public static String value(String header) {
    return header.split(":")[1]; // violation: PairSplitDropsRest
  }

  public static String parameter(String pair) {
    String[] parts = pair.split("=");
    return parts[1]; // violation: PairSplitDropsRest
  }

  public static String limited(String header) {
    String[] parts = header.split(":", 2);
    return parts.length == 2 ? parts[1] : "";
  }

  public static String tail(String header) {
    int colon = header.indexOf(':');
    return colon < 0 ? "" : header.substring(colon + 1);
  }

  public static String minutes(String time) {
    return time.split(":")[1];
  }

  public static String first(String header) {
    return header.split(":")[0];
  }
}
