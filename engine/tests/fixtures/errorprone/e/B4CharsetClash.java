package e;

public class B4CharsetClash {
  static final String UTF_8 = "x";

  void m(String s) throws Exception {
    s.getBytes("UTF-8");
  }
}
