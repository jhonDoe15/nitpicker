public class B3Dedupe {
  static final String C = "hello world";
  static final String COMBINED = "hello " + "there";
  static String mutable = "mutable text";
  private static final String D = "second constant";

  void f() {
    System.err.println("hello world");
    System.err.println("hello world");
    System.err.println("hello there");
    System.err.println("hello there");
    System.err.println("mutable text");
    System.err.println("mutable text");
  }

  void effectivelyFinal() {
    String local = "local value";
    System.err.println("local value");
    System.err.println("local value");
    String reassigned = "other value";
    reassigned = "third";
    System.err.println("other value");
    System.err.println("other value");
  }

  void hidden(String C) {
    System.err.println("hello world");
    System.err.println("hello world");
  }

  void single() {
    System.err.println("second constant");
  }

  void tooShort() {
    String s = ".";
    System.err.println(".");
    System.err.println(".");
  }

  class Inner {
    void g() {
      System.err.println("hello world");
      Runnable r = () -> System.err.println("second constant");
      r.run();
    }
  }

  @SuppressWarnings("hello world")
  void annotated() {}

  void block() {
    {
      final String scoped = "scoped value";
      System.err.println("scoped value");
    }
    System.err.println("scoped value");
    System.err.println("scoped value");
  }

  String text = """
      block of text""";

  void texts() {
    System.err.println("""
        block of text""");
  }
}

class B3DedupeOther {
  static final String C = "other class";

  void f() {
    System.err.println("other class");
    System.err.println("hello world");
  }
}
