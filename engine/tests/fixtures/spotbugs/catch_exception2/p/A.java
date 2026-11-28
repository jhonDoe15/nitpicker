package p;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
public class A {
  void io() throws IOException {}
  void io2() throws IOException, InterruptedException {}
  void ioRt() throws IOException, IllegalStateException {}
  void rt() throws IllegalStateException {}
  void a() {
    try {
      io2();
    } catch (Exception e) {
      rt();
    }
  }
  void b(Class<?> c) {
    try {
      c.getDeclaredMethod("x");
    } catch (Exception e) {
    }
  }
  void c() {
    try {
      ioRt();
    } catch (Exception e) {
    }
  }
  void d() {
    try {
      io();
      rt();
    } catch (Exception e) {
    }
  }
  void e() {
    try {
      io();
      if (Math.random() > 1) throw new IllegalStateException();
    } catch (Exception e) {
    }
  }
  void f(Method m) {
    try {
      m.invoke(null);
    } catch (Exception e) {
    }
  }
  void g(Field f) {
    try {
      f.set(null, null);
    } catch (Exception e) {
    }
  }
  void h() {
    try {
      io();
      Integer.parseInt("1");
    } catch (Exception e) {
    }
  }
  void i() {
    try (InputStream in = new ByteArrayInputStream(new byte[0])) {
      in.read();
    } catch (Exception e) {
    }
  }
  void j() {
    try (StringReader in = new StringReader("")) {
      in.read();
    } catch (Exception e) {
    }
  }
  void k() {
    try {
      Class.forName("x").getMethod("m").invoke(null);
    } catch (Exception e) {
    }
  }
  void l(Class<?> c) {
    try {
      c.getDeclaredMethod("x");
      io();
    } catch (Exception e) {
    }
  }
  void m(Class<?> c) {
    try {
      Class.forName("x");
      c.getDeclaredMethod("x");
    } catch (Exception e) {
    }
  }
  void n() {
    try {
      Class.forName("x");
    } catch (Exception e) {
    }
  }
}
