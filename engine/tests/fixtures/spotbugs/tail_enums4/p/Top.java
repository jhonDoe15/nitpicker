package p;
public enum Top {
  A;
  private int f, g, h;
  public void s1(int a) { int b = a, c = b; f = c; }
  public void s2(int a) { int b = a; int c = b; f = c; }
  public void s3(int a) { f = g = a; }
  public void s4(int a) { f = (g = a); }
  public void s5(int a) { int b; f = b = a; }
  public static void s6(int a, Top t) { t.f = a; }
  public static void s7(int a) { A.f = a; }
  public static void s8(int a) { Top t = A; t.g = a; }
  public void s9(int a) { f = a; }
  public void s10(int a) { switch (a) { case 1: break; default: break; } f = a; }
  public void s11(String a) { switch (a) { case "x": break; } f = a.length(); }
  public void s14(int a) { try { } catch (Exception e) {} f = a; }
  public void s15(int a) { if (false) {} f = a; }
  public void s16(int a) { if (true) {} f = a; }
  public void s17(int a) { final boolean K = true; if (K) { f = a; } }
  public void s18(int a) { Object o = new Object() { int x = a; }; f = a; }
  public void s19(int a) { do { } while (false); f = a; }
  public void s23(int a) { if (a > 0) throw new RuntimeException(); f = a; }
  public void s24(int a) { int[] arr = new int[a]; f = a; }
  public void s25(int a) { f = a << 1; }
  public void s26(int a) { f = a + 0; }
  public void s27(int a) { f = a; g = f; }
  public void s28(int a) { h = f = g = a; }
}
