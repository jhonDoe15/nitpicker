package s18pkg.a;

public class A {
  public static final int CONST = 42;

  public static final int foo() {
    return 42;
  }

  public static final int bar() {
    return 42;
  }

  public static class Inner extends Super {}

  public static class Both {}

  public static int Both() {
    return 1;
  }
}
