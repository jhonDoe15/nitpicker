package e;

public class S17HashCode {
  static class Negative {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      Negative that = (Negative) o;
      return a == that.a && b == that.b;
    }

    @Override
    public int hashCode() {
      return a + 31 * b;
    }
  }

  static class Positive {
    private int foo;
    private int bar;

    @Override
    public boolean equals(Object o) {
      Positive that = (Positive) o;
      return foo == that.foo;
    }

    @Override
    public int hashCode() {
      return foo + 31 * bar;
    }
  }

  static class ViaGetter {
    private int foo;
    private int bar;

    @Override
    public boolean equals(Object o) {
      ViaGetter that = (ViaGetter) o;
      return foo == that.foo;
    }

    @Override
    public int hashCode() {
      return foo + 31 * getBar();
    }

    private int getBar() {
      return bar;
    }
  }

  static class InstanceEquality {
    private int a;
    private int b;

    @Override
    public boolean equals(Object o) {
      return this == o;
    }

    @Override
    public int hashCode() {
      return a + 31 * b;
    }
  }

  static class Memoized {
    private int a;
    private int b;
    private int hashCode;

    @Override
    public boolean equals(Object o) {
      Memoized that = (Memoized) o;
      return this.a == that.a && this.b == that.b;
    }

    @Override
    public int hashCode() {
      return hashCode;
    }
  }

  static class LabeledBreak {
    private int a;
    private int b;
    private int hashCode;

    public void accessesLocalWithLabeledBreak() {
      label:
      {
        switch (a) {
          case 0:
            break label;
        }
      }
    }

    @Override
    public boolean equals(Object o) {
      LabeledBreak that = (LabeledBreak) o;
      return this.a == that.a && this.b == that.b;
    }

    @Override
    public int hashCode() {
      return hashCode;
    }
  }

  static class OtherCall {
    private int foo;
    private int bar;

    private int compute() {
      return foo;
    }

    @Override
    public boolean equals(Object o) {
      OtherCall that = (OtherCall) o;
      return foo == that.foo;
    }

    @Override
    public int hashCode() {
      return compute() + bar;
    }
  }

  static class StaticCall {
    private int foo;
    private int bar;

    @Override
    public boolean equals(Object o) {
      StaticCall that = (StaticCall) o;
      return foo == that.foo;
    }

    @Override
    public int hashCode() {
      return Integer.hashCode(foo) + bar;
    }
  }

  @SuppressWarnings("InconsistentHashCode")
  static class Suppressed {
    private int foo;
    private int bar;

    @Override
    public boolean equals(Object o) {
      Suppressed that = (Suppressed) o;
      return foo == that.foo;
    }

    @Override
    public int hashCode() {
      return foo + 31 * bar;
    }
  }

  static class ThisQualified {
    private int foo;
    private int bar;

    @Override
    public boolean equals(Object o) {
      ThisQualified that = (ThisQualified) o;
      return this.foo == that.foo;
    }

    @Override
    public int hashCode() {
      return this.foo + 31 * this.bar;
    }
  }

  record Rec(int a, int b) {
    @Override
    public int hashCode() {
      return a;
    }
  }
}
