package e;

import java.util.AbstractList;

public class B4Hiding {
  static class Parent {
    protected int a;
    public int b;
    int c;
    private int d;
    static int e;
    protected String f;
  }

  static class Child extends Parent {
    int a;
    int b, f;
    int c;
    int d;
    int e;
    static int g;
    @SuppressWarnings("HidingField")
    int suppressedField;
  }

  static class Middle extends Parent {
    int m;
    protected int a;
  }

  static class Grand extends Middle {
    int a;
    int m;
    int f;
  }

  static class Unrelated {
    int a;
  }

  static class ListLike extends AbstractList<String> {
    int modCount;
    public String get(int i) {
      return null;
    }
    public int size() {
      return 0;
    }
  }

  enum E {
    X;
    int name;
    int ordinal;
  }

  record R(int a) {}

  interface I {
    int a = 1;
  }

  static class WithAnon {
    Object o = new Parent() {
      int a;
      int other;
    };
  }

  @SuppressWarnings("OvershadowingSubclassFields")
  static class Suppressed extends Parent {
    int a;
  }

  @SuppressWarnings("hiding")
  static class Suppressed2 extends Parent {
    int a;
  }

  static class Generic<T> {
    T value;
  }

  static class GenericChild extends Generic<String> {
    String value;
  }
}
