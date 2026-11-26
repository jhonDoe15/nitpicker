package e;

/**
 * Doc with escape \u0041 and \u007e and a nonprintable \u0001 and \u00e9 and \u000a newline.
 */
public class B4Unicode {
  String a = "\u0041bc";
  String b = "\u0009tab";
  String d = "\\u0041";
  String e = "\\\u0041";
  String f = "\uuuu0042";
  String g = "caf\u00e9";
  // comment with \u0020 space
  /* block \u0021 comment */
  @SuppressWarnings("UnicodeEscape")
  String h = "\u0041";

  @SuppressWarnings("all")
  void m() {
    String x = "\u0041\u0042";
  }

  void n() {
    String z = "\u005c\u005c";
    String w = "A\u0042C\u0043";
    char t = '\u0061';
    String s = "\u0041" + "\u0042";
  }
}
