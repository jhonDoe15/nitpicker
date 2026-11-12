package a;

public class Util {
  public static int twice(int value) {
    return value * 2;
  }

  public static int pick(int value) {
    return value;
  }

  public static String pick(String value) {
    return value;
  }

  public static int plain() {
    return 1;
  }

  public int total() {
    return plain() + twice(2);
  }
}
