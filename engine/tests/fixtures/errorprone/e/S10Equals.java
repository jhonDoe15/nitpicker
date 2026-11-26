package e;

import com.google.common.base.Objects;
import java.util.Arrays;

class S10EqualsWrong {
  private int a;
  private int b;
  private Object c;
  private Object d;
  private int[] arr1;
  private int[] arr2;
  static int st1;
  static int st2;

  private int getA() {
    return a;
  }

  private int getB() {
    return b;
  }

  static class Negative {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Negative that = (Negative) o;
      return a == that.a && Objects.equal(b, that.b);
    }
  }

  static class Unordered {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Unordered that = (Unordered) o;
      return (a == that.a && b == that.b) || (a == that.b && b == that.a);
    }
  }

  static class Mixed {
    private int a;
    private int b;
    private Object c;

    private int getA() {
      return a;
    }

    private int getB() {
      return b;
    }

    @Override
    public boolean equals(Object o) {
      Mixed that = (Mixed) o;
      return this.a == that.getA() && this.b == that.getB() && c.equals(that.c);
    }
  }

  static class Fields {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Fields that = (Fields) o;
      return a == that.b && b == that.b;
    }
  }

  static class Getters {
    private int a;
    private int b;

    private int getA() {
      return a;
    }

    private int getB() {
      return b;
    }

    @Override
    public boolean equals(Object o) {
      Getters that = (Getters) o;
      return getA() == that.getB() && getB() == that.getB();
    }
  }

  static class Objs {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Objs that = (Objs) o;
      return Objects.equal(a, that.b) && b == that.b;
    }
  }

  static class JavaUtilObjs {
    private Object a;
    private Object b;

    @Override
    public boolean equals(Object o) {
      JavaUtilObjs that = (JavaUtilObjs) o;
      return java.util.Objects.equals(a, that.b) && java.util.Objects.equals(b, that.b);
    }
  }

  static class InstanceEquals {
    private Object a;
    private Object b;

    @Override
    public boolean equals(Object o) {
      InstanceEquals that = (InstanceEquals) o;
      return a.equals(that.b) && b == that.b;
    }
  }

  static class NotEqual {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      NotEqual that = (NotEqual) o;
      if (a != that.b) {
        return false;
      }
      return b == that.b;
    }
  }

  static class Arrs {
    private int[] a;
    private int[] b;

    @Override
    public boolean equals(Object o) {
      Arrs that = (Arrs) o;
      return Arrays.equals(a, that.b) && Arrays.equals(b, 0, 1, that.b, 2, 3);
    }
  }

  static class SuperEquals {
    private int a;

    @Override
    public boolean equals(Object o) {
      return super.equals(this) && this.equals(o);
    }
  }

  static class Statics {
    static int s1;
    static int s2;
    private int a;

    @Override
    public boolean equals(Object o) {
      Statics that = (Statics) o;
      return s1 == s2 && a == that.a && s1 == that.s2;
    }
  }

  static class Locals {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Locals that = (Locals) o;
      int x = 1;
      int y = 2;
      return x == y && a == that.a && that.b == b;
    }
  }

  static class Nested {
    private int a;
    private int b;
    private Nested inner;

    @Override
    public boolean equals(Object o) {
      Nested that = (Nested) o;
      return inner.a == that.inner.b && inner.a == that.b && a == inner.b;
    }
  }

  static class Lambdas {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Lambdas that = (Lambdas) o;
      java.util.function.BooleanSupplier s = () -> a == that.b;
      return s.getAsBoolean() && a == that.b;
    }
  }

  static class Suppressed {
    private int a;
    private int b;

    @SuppressWarnings("EqualsWrongThing")
    @Override
    public boolean equals(Object o) {
      Suppressed that = (Suppressed) o;
      return a == that.b;
    }
  }

  static class NotEquals {
    private int a;
    private int b;

    boolean same(NotEquals that) {
      return a == that.b;
    }

    public boolean equals(NotEquals that) {
      return a == that.b;
    }
  }

  boolean arraysSix(int[] a, int[] b) {
    return Arrays.equals(a, 0, 1, b, 2, 3);
  }
}
