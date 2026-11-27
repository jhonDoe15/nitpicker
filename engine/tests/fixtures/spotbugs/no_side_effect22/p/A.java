package p;
public class A {
  public interface I { Object m(Object t); }
  public static class Base implements I { Object p; public Base(Object p) { this.p = p; } public Object m(Object t) { return null; } }
  void a(I i, Object t) { i.m(t); }
  void b(final Object v, Object q) { Object x = new Base(q) { public Object m(Object t) { return v; } }; }
}
