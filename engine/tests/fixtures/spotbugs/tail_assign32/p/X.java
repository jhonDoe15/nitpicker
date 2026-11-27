package p;
public class X {
  int foo() { return 1; }
  void m0(int[] a) { int x = 0, y = 0, z = 0; x = (x = 1); }
  void m1(int[] a) { int x = 0, y = 0, z = 0; x = x = y = 1; }
  void m2(int[] a) { int x = 0, y = 0, z = 0; y = x = x = 1; }
  void m3(int[] a) { int x = 0, y = 0, z = 0; x = y = x = 1; }
  void m4(int[] a) { int x = 0, y = 0, z = 0; x = x = y; }
  void m5(int[] a) { int x = 0, y = 0, z = 0; x = y = y; }
  void m6(int[] a) { int x = 0, y = 0, z = 0; x = (x) = 2; }
  void m7(int[] a) { int x = 0, y = 0, z = 0; (x) = x = 3; }
  void m8(int[] a) { int x = 0, y = 0, z = 0; x = x = (y = 1); }
  void m9(int[] a) { int x = 0, y = 0, z = 0; x = x = y++; }
  void m10(int[] a) { int x = 0, y = 0, z = 0; x = x = y += 1; }
  void m11(int[] a) { int x = 0, y = 0, z = 0; x = x += 1; }
  void m12(int[] a) { int x = 0, y = 0, z = 0; x = x -= 1; }
  void m13(int[] a) { int x = 0, y = 0, z = 0; x += x = 1; }
  void m14(int[] a) { int x = 0, y = 0, z = 0; x = x++; }
  void m15(int[] a) { int x = 0, y = 0, z = 0; x = (x += 1); }
  void m16(int[] a) { int x = 0, y = 0, z = 0; x = x = x + 1; }
  void m17(int[] a) { int x = 0, y = 0, z = 0; x = x = foo(); }
  void m18(int[] a) { int x = 0, y = 0, z = 0; x = x = (int) 2L; }
  void m19(int[] a) { int x = 0, y = 0, z = 0; x = (x = foo()) + 1; }
  void m20(int[] a) { int x = 0, y = 0, z = 0; x = x = x = 1; }
  void m21(int[] a) { int x = 0, y = 0, z = 0; x = (x = x = 1); }
  void m22(int[] a) { int x = 0, y = 0, z = 0; x = x = y = z = 1; }
  void m23(int[] a) { int x = 0, y = 0, z = 0; x = y = z = x = 1; }
  void m24(int[] a) { int x = 0, y = 0, z = 0; y = x = x = z = 1; }
  void m25(int[] a) { int x = 0, y = 0, z = 0; z = y = x = x = 1; }
  void m26(int[] a) { int x = 0, y = 0, z = 0; x = x = (y = x = 1); }
  void m27(int[] a) { int x = 0, y = 0, z = 0; x = x = 1 + (y = 2); }
  void m28(int[] a) { int x = 0, y = 0, z = 0; x = x = y == 1 ? 1 : 2; }
  void m29(int[] a) { int x = 0, y = 0, z = 0; x = x = a[0]; }
  void m30(int[] a) { int x = 0, y = 0, z = 0; x = x = a[y = 0]; }
  void m31(int[] a) { int x = 0, y = 0, z = 0; x = x = new int[1].length; }
  void m32(int[] a) { int x = 0, y = 0, z = 0; x = x = (y = 1) + 1; }
  void m33(int[] a) { int x = 0, y = 0, z = 0; x = x = y = y = 1; }
  void m34(int[] a) { int x = 0, y = 0, z = 0; x = x = (byte) 1; }
  void m35(int[] a) { int x = 0, y = 0, z = 0; if (x == 0) x = x = 1; }
  void m36(int[] a) { int x = 0, y = 0, z = 0; x = x = 1; y = y = 2; }
  void m37(int[] a) { int x = 0, y = 0, z = 0; x = x = 1; x = x = 2; }
  void m38(int[] a) { int x = 0, y = 0, z = 0; x = x = x; }
  void m39(int[] a) { int x = 0, y = 0, z = 0; x = x = (x); }
  void m40(int[] a) { int x = 0, y = 0, z = 0; x = ((x = 1)); }
  void m41(int[] a) { int x = 0, y = 0, z = 0; x = (((x))) = 1; }
  void t0() { char x = 'a'; x = x = 'a'; }
  void u0(char x) { x = x = 'a'; }
  void w0() { char x = 'a'; char y = 'a'; x = y = x = 'a'; }
  void z0() { char x = 'a'; char y = 'a'; x = x = y = 'a'; }
  void t1() { byte x = 1; x = x = 1; }
  void u1(byte x) { x = x = 1; }
  void w1() { byte x = 1; byte y = 1; x = y = x = 1; }
  void z1() { byte x = 1; byte y = 1; x = x = y = 1; }
  void t2() { short x = 1; x = x = 1; }
  void u2(short x) { x = x = 1; }
  void w2() { short x = 1; short y = 1; x = y = x = 1; }
  void z2() { short x = 1; short y = 1; x = x = y = 1; }
  void t3() { boolean x = true; x = x = true; }
  void u3(boolean x) { x = x = true; }
  void w3() { boolean x = true; boolean y = true; x = y = x = true; }
  void z3() { boolean x = true; boolean y = true; x = x = y = true; }
  void t4() { float x = 1f; x = x = 1f; }
  void u4(float x) { x = x = 1f; }
  void w4() { float x = 1f; float y = 1f; x = y = x = 1f; }
  void z4() { float x = 1f; float y = 1f; x = x = y = 1f; }
  void t5() { Object x = null; x = x = null; }
  void u5(Object x) { x = x = null; }
  void w5() { Object x = null; Object y = null; x = y = x = null; }
  void z5() { Object x = null; Object y = null; x = x = y = null; }
  void t6() { String x = "s"; x = x = "s"; }
  void u6(String x) { x = x = "s"; }
  void w6() { String x = "s"; String y = "s"; x = y = x = "s"; }
  void z6() { String x = "s"; String y = "s"; x = x = y = "s"; }
  void t7() { Integer x = 1; x = x = 1; }
  void u7(Integer x) { x = x = 1; }
  void w7() { Integer x = 1; Integer y = 1; x = y = x = 1; }
  void z7() { Integer x = 1; Integer y = 1; x = x = y = 1; }
  void t8() { long x = 1L; x = x = 1L; }
  void u8(long x) { x = x = 1L; }
  void w8() { long x = 1L; long y = 1L; x = y = x = 1L; }
  void z8() { long x = 1L; long y = 1L; x = x = y = 1L; }
  void t9() { double x = 1.0; x = x = 1.0; }
  void u9(double x) { x = x = 1.0; }
  void w9() { double x = 1.0; double y = 1.0; x = y = x = 1.0; }
  void z9() { double x = 1.0; double y = 1.0; x = x = y = 1.0; }
  void t10() { int[] x = null; x = x = null; }
  void u10(int[] x) { x = x = null; }
  void w10() { int[] x = null; int[] y = null; x = y = x = null; }
  void z10() { int[] x = null; int[] y = null; x = x = y = null; }
}