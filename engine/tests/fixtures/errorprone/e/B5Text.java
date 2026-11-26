package e;

import java.util.StringJoiner;

class B5Text {
  static final String THREE =
      "first\n"
          + "second\n"
          + "third";

  static final String TWO_TRAILING =
      "first\n"
          + "second\n";

  static final String TWO_NO_TRAILING = "first\n" + "second";

  static final String INDENTED =
      "class A {\n"
          + "  void f() {}\n"
          + "    // deeper\n"
          + "}\n";

  static final String SPACES =
      "trailing   \n"
          + "  indented  \n"
          + "end ";

  static final String QUOTES = "say \"hi\"\n" + "back\\slash\n" + "tab\there\n" + "done";

  static final String UNICODE = "café\n" + "naïve\n" + "ok\n";

  static final String BLANK = "a\n" + "\n" + "b\n" + "\n";

  static final String NOT_ALL = "a\n" + "b" + "c\n";

  static final String DELIM = "a\n" + "\"\"\"\n" + "b\n";

  static final String COMMENT =
      "a\n" // one
          + "b\n"
          + "c\n";

  static final String SINGLE = "just one\n";

  static String inConcat(String x) {
    return x + "a\n" + "b\n" + "c\n";
  }

  static String inConcatAfter(String x) {
    return "a\n" + "b\n" + "c\n" + x;
  }

  static String parenthesized(String x) {
    return ("a\n" + "b\n" + "c\n") + x;
  }

  static String joined() {
    return String.join("\n", "a", "b", "c");
  }

  static String joinedOne() {
    return String.join("\n", "a");
  }

  static String joinedChar(String x) {
    return String.join("\n", "a", x);
  }

  static String joinedOther() {
    return String.join(",", "a", "b");
  }

  static String sj() {
    return new StringJoiner("\n").add("a").add("b").add("c").toString();
  }

  static String sjOther() {
    return new StringJoiner(",").add("a").add("b").toString();
  }

  void nested() {
    String s =
        "x\n"
            + "y\n"
            + "z\n";
    System.out.println(
        "first\n"
            + "second\n"
            + "third\n");
  }

  @SuppressWarnings("StringConcatToTextBlock")
  static final String QUIET = "a\n" + "b\n" + "c\n";

  static final String ALREADY = """
      a
      b
      """;

  static final String MIXED = "a\n" + """
      b
      """ + "c\n";

  static final String EMPTY_LINES = "\n" + "\n" + "\n";

  static final String TAB_INDENT =
		"a\n"
				+ "b\n"
				+ "c\n";
}
