package e;

public class B4CharsetClash2 {
  static class StandardCharsets {}

  void m(String s) throws Exception {
    String ISO_8859_1 = "x";
    s.getBytes("ISO-8859-1");
    s.getBytes("US-ASCII");
  }
}
