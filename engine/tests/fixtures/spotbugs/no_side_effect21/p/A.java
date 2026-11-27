package p;
public class A {
  public interface I { Object m(Object t) throws java.io.IOException; }
  public static class Base implements I { public Base() {} public Object m(Object t) throws java.io.IOException { return null; } }
  void a(I i, Object t) throws java.io.IOException { i.m(t); }
  void b(Object v, I i) { Object x = new Base() { public Object m(Object t) { return v; } }; }
}
