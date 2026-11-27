package p;
import java.lang.reflect.*;
public class A {
  Class<?> clazz; String name;
  static void fix(Member m, boolean b) {}
  A(Object a, Field f, Object b) {}
  A() {}
  Object r1() {
    try {
      Field f = clazz.getDeclaredField(name);
      if (!f.isAccessible()) {
        fix(f, false);
      }
      return new A(null, f, null);
    } catch (Exception e) {
      throw new IllegalArgumentException("x" + name);
    }
  }
  Object r2() {
    try {
      Field f = clazz.getDeclaredField(name);
      return new A(null, f, null);
    } catch (Exception e) {
      throw new IllegalArgumentException("x" + name);
    }
  }
  Object r3() {
    try {
      Field f = clazz.getDeclaredField(name);
      return f;
    } catch (Exception e) {
      throw new IllegalArgumentException("x");
    }
  }
  Object r4() {
    try {
      Field f = clazz.getDeclaredField(name);
      return f;
    } catch (Exception e) {
      return null;
    }
  }
  Object r5() {
    try {
      Field f = clazz.getDeclaredField(name);
      if (!f.isAccessible()) {
        fix(f, false);
      }
      return f;
    } catch (Exception e) {
      return null;
    }
  }
  Object r6() {
    try {
      Field f = clazz.getDeclaredField(name);
      f.isAccessible();
      return f;
    } catch (Exception e) {
      return null;
    }
  }
  Object r7() {
    try {
      Field f = clazz.getDeclaredField(name);
      fix(f, false);
      return f;
    } catch (Exception e) {
      return null;
    }
  }
  Object r8() {
    try {
      Field f = clazz.getDeclaredField(name);
      if (f == null) {
        return null;
      }
      return f;
    } catch (Exception e) {
      return null;
    }
  }
}
