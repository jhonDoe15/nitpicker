package p;
public class A {
  public interface I { Object m(Object t); }
  static class Base implements I { public Object m(Object t) { return t; } }
  void a(I i, Object t) { i.m(t); }
  void b(Base i, Object t) { i.m(t); }
}
