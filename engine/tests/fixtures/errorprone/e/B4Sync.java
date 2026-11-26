package e;

import java.io.InputStream;
import java.io.IOException;

public class B4Sync {
  static class Base {
    synchronized void a() {}
    synchronized int b() { return 1; }
    synchronized void c() {}
    synchronized void d(int x) {}
    synchronized void e() {}
    synchronized Object f() { return null; }
    synchronized void g() {}
    synchronized void h() {}
    void i() {}
  }

  static class Derived extends Base {
    @Override void a() { System.out.println(); System.out.println(); }
    @Override int b() { return 2; }
    @Override void c() {}
    @Override void d(int x) { super.d(x); }
    @Override synchronized void e() {}
    @Override Object f() { return super.f(); }
    @Override void g() { super.g(); }
    @Override void h() { System.out.println(); }
    @Override void i() { System.out.println(); }
  }

  static class Another extends Base {
    final int field = 1;
    @Override void a() { }
    @Override int b() { return field; }
    @Override Object f() { return (Object) super.f(); }
    @Override void g() { int x = 1; super.g(); }
    @Override void e() { synchronized (this) { System.out.println(); } }
    @Override void h() { throw new RuntimeException(); }
    @Override void c() { return; }
  }

  static class Stream extends InputStream {
    @Override public int read() throws IOException { return 0; }
    @Override public void mark(int limit) { System.out.println(); System.out.println(); }
    @Override public void reset() throws IOException { System.out.println(); System.out.println(); }
  }

  static class Vec extends java.util.Vector<String> {
    @Override public int size() { System.out.println(); return 0; }
    @Override public boolean add(String s) { return false; }
    @Override public String get(int i) { System.out.println(); System.out.println(); return null; }
    @Override public void clear() { System.out.println(); System.out.println(); }
  }

  static class Sup extends Base {
    @SuppressWarnings("UnsynchronizedOverridesSynchronized")
    @Override void a() { System.out.println(); System.out.println(); }
  }
}
