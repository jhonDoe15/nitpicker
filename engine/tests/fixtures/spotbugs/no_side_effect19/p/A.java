package p;
public class A {
  public interface I { Object m(Object t); }
  public static class Base implements I { public Base() {} public Object m(Object t) { return null; } }
  static class Sub extends Base { Object f; public Object m(Object t) { return f; } }
  void a(I i, Object t) { i.m(t); }
}
