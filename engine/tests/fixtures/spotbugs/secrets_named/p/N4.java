package p;
public class N4 {
  public void setPassword(String s) {}
  static final String SC = "c";
  static String nf = "n";
  String inst = "i";
  String never;
  static String mk() { return "x"; }
  static String id(String s) { return s; }
  void m1() { setPassword("x"); }
  void m2() { setPassword(SC); }
  void m3() { setPassword(nf); }
  void m4() { setPassword(inst); }
  void m5() { setPassword(never); }
  void m6(boolean b) { setPassword(b ? "x" : "y"); }
  void m7(boolean b, String s) { setPassword(b ? s : "y"); }
  void m8(boolean b) { String p; if (b) p = "x"; else p = "y"; setPassword(p); }
  void m9() { setPassword("x".trim()); }
  void m10(String s) { setPassword(s + "x"); }
  void m11() { setPassword(mk()); }
  void m12() { setPassword(id("x")); }
  void m13() { setPassword(null); }
  void m14() { setPassword(""); }
  void m15() { setPassword(new StringBuilder("a").append("b").toString()); }
  void m16() { setPassword(String.valueOf(1)); }
  void m17() { setPassword("a" + "b"); }
  void m18(boolean b, String s) { String p = "x"; if (b) p = s; setPassword(p); }
  void m19() { setPassword(String.format("%s", "x")); }
  void m20() { setPassword(System.getenv("x")); }
  void m21() { setPassword(new String("x")); }
  void m22() { setPassword("x".toUpperCase()); }
}
