package p;
public class A {
  public interface I { Object m(Object t); }
  public static class Base implements I { public Base() {} public Object m(Object t) { return null; } }
  void a(I i, Object t) { i.m(t); }
  void b(Object v, I i) { i.hashCode(); Object x = new Base() { public Object m(Object t) { return v; } }; }
}
