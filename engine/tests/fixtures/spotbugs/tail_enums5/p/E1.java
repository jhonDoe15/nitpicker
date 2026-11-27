package p;
public enum E1 {
  X, Y { public void set(int a) { v = a; } };
  public int v; public volatile int w; public transient int tr; public int[] arr; public int a1, a2 = 3;
  @Deprecated public String ann;
  protected int prot; int pkg; public static int st; public final int fin = 1;
  public void set(int a) { v = a; }
  public void set2(int a) { this.v = a; this.w = a; }
  public void set3(int a) { int b = a; b = 5; this.v = b; }
  public void set4(int a) { int b = a; v = b; b = 5; w = b; }
  public void set5(int a) { a = 5; v = a; }
  public void set6(int a, int c) { v = a; w = c; v = c; }
  public void set7(int a) { System.out.println(); v = a; }
  public void set8(int a) { new Object(); v = a; }
  public void set9(int a) { String s = "x" + a; v = a; }
  public void set10(Object a) { boolean b = a instanceof String; v = (Integer) a; }
  public void set11(Object a) { v = 1; }
  public void set12(int a) { do { } while (false); v = a; }
  public void set13(int... a) { v = a[0]; arr = a; }
  public void set14(int a) { v++; w = a; }
  public void set15(int a) { Runnable r = () -> {}; v = a; }
  public void set16(int a) { v = a; }
  public void set17(int a) { synchronized (this) { v = a; } }
  public void set18(int a) { try { v = a; } finally {} }
  public void set19(int a) { try { } finally {} v = a; }
  public void set20(int a) { v += a; }
  public void set21(E1 o, int a) { o.v = a; X.w = a; E1.Y.v = a; }
  public void set22(int a) { var b = a; v = b; }
  public void set23(int a) { final int b; b = a; v = b; }
  public void set24(int a) { v = a = 7; }
  public void set25(int a) { int b = a, c = b; v = c; }
  public void set26(int a) { v = w = a; }
  public void set27(Integer a) { v = a; }
  public void set28(int a) { long q = a; w = (int) q; }
  public void set29(int a) { int[] q = {a}; v = q[0]; }
  public void set30(int a) { for (int i : new int[]{1}) {} v = a; }
  public void set31(int a) { try (java.io.StringReader r = new java.io.StringReader("")) { } catch (Exception e) {} v = a; }
  public void set32(int a) { if (a > 0) {} v = a; }
  public void set33(int a) { v = a; if (a>0) w = a; }
  public static void sset(int a, E1 e) { e.v = a; }
  void pset(int a) { v = a; }
  protected void prset(int a) { v = a; }
  public synchronized void syn(int a) { v = a; }
  public E1 ret(int a) { v = a; return this; }
  public void gen(Object a) { ann = (String) a; }
  public void str(String a) { ann = a.trim(); }
}
