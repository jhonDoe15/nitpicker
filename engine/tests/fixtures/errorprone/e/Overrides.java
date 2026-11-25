package e;

import java.lang.annotation.ElementType;
import java.lang.annotation.Target;
import java.util.ArrayList;
import java.util.List;

class Overrides {
  @Target(ElementType.TYPE_USE) @interface T {}
  @interface D {}

  static class Base {
    public String a(String s) { return s; }
    protected void b(int x) {}
    public void c() {}
    @D public void d() {}
    public void e(@D String s) {}
    public void f(@T String s) {}
    public synchronized void g() {}
    public void h(String... s) {}
    public Object i() { return null; }
    void j() {}
    @Deprecated public void k() {}
    public final void fin() {}
    public void m(int a, int b) {}
  }

  static class Sub extends Base {
    @Override public String a(String s) { return super.a(s); }
    @Override protected void b(int x) { super.b(x); }
    @Override public void c() { super.c(); }
    @Override public void d() { super.d(); }
    @Override @D public void e(String s) { super.e(s); }
    @Override public void f(@T String s) { super.f(s); }
    @Override public void g() { super.g(); }
    @Override public void h(String... s) { super.h(s); }
    @Override public Object i() { return (super.i()); }
    @Override void j() { super.j(); }
    @Override public void k() { super.k(); }
    @Override public void m(int a, int b) { super.m(b, a); }
  }

  static class Sub2 extends Base {
    @Override public void c() {
      // comment
      super.c();
    }
    @Override public synchronized void g() { super.g(); }
    @Override @D public void d() { super.d(); }
    @Override public void e(@D String s) { super.e(s); }
    @Override public void f(String s) { super.f(s); }
    @Override public final void j() { super.j(); }
    @Override public Object i() { return super.i(); }
    /** Doc */
    @Override public void k() { super.k(); }
    @Override public void m(int a, int b) { super.m(a, b); }
    @Override public String toString() { return super.toString(); }
    @Override public int hashCode() { return super.hashCode(); }
  }

  static class L<X> extends ArrayList<X> {
    @Override public boolean add(X x) { return super.add(x); }
    @Override public int size() { return super.size(); }
    @Override public void clear() { super.clear(); }
    @Override public X get(int i) { return super.get(i); }
  }

  interface I { default void q() {} }
  static class Impl implements I {
    @Override public void q() { I.super.q(); }
  }
  static class Sub3 extends Sub2 {
    @Override public void c() { super.c(); }
  }
}
