package s18pkg.a;

public class Super {
  public static final int SUPER_CONST = 42;

  public static int shared() {
    return 1;
  }

  static int hidden() {
    return 1;
  }
}
