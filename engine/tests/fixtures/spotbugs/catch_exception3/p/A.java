package p;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
public class A {
  Object io2() throws IOException, InterruptedException { return null; }
  static void plain() {}
  static void thrower() { throw new IllegalStateException(); }
  static void maybe(int x) { if (x > 0) throw new IllegalStateException(); }
  void k2() {
    try {
      Object o = (String) Class.forName("x").getMethod("m").invoke(null);
    } catch (Exception e) {
    }
  }
  void k3() {
    try {
      Objects.requireNonNull(Class.forName("x").getMethod("m").invoke(null));
    } catch (Exception e) {
    }
  }
  Object k5() {
    try {
      return Class.forName("x").getMethod("m").invoke(null);
    } catch (Exception e) {
      return null;
    }
  }
  void a() {
    try {
      Object o = (String) io2();
    } catch (Exception e) {
    }
  }
  void b() {
    try {
      io2();
      plain();
    } catch (Exception e) {
    }
  }
  void c() {
    try {
      io2();
      thrower();
    } catch (Exception e) {
    }
  }
  void d() {
    try {
      io2();
      maybe(1);
    } catch (Exception e) {
    }
  }
  void e() {
    try {
      io2();
      new A();
    } catch (Exception e) {
    }
  }
  void f(Class<?> c) {
    try {
      Field f = c.getDeclaredField("x");
      plain();
    } catch (Exception e) {
    }
  }
  void g(Class<?> c) {
    try {
      Field f = c.getDeclaredField("x");
    } catch (Exception e) {
    }
  }
  Object h() {
    try {
      return io2();
    } catch (Exception e) {
      return null;
    }
  }
  void i(int[] arr) {
    try {
      io2();
      arr[0] = 1;
    } catch (Exception e) {
    }
  }
  void j(Object o) {
    try {
      io2();
      o.toString();
    } catch (Exception e) {
    }
  }
  void k(String s) {
    try {
      io2();
      s.length();
    } catch (Exception e) {
    }
  }
}
