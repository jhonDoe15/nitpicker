package p;
public class A {
  public interface I { Object m(Object t); }
  void a(I i, Object t) { i.m(t); }
  void b(Object v) { Object x = new I() { public Object m(Object t) { return v; } }; }
}
