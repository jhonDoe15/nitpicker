package e;

import java.util.List;

public class B4CommonNames {
  class String {}

  static class Process {}

  interface Runnable {}

  enum Thread { A }

  record Record(int a) {}

  static class Compiler {}

  static class Module {}

  static class Fine {}

  <Object> void m(Object x) {}

  <T extends Number, Integer> void n() {}

  static class Gen<Void> {}

  void local() {
    class Override {}
    Object o = new Object() {};
  }

  @SuppressWarnings("JavaLangClash")
  static class Error {}

  @SuppressWarnings("AvoidCommonTypeNames")
  static class Exception {}

  @interface Deprecated {}
}
