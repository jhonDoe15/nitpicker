class F43Or2 {
  static class FormatException extends Exception {
    FormatException(String f, Object... xs) {
      super(String.format(f, xs));
    }
  }

  void f() {
    String s = "%s";
    new FormatException("%s");
    System.err.printf("%s");
  }

  void appendToStringBuilder(StringBuilder b) {
    b.append("%s");
  }
}
