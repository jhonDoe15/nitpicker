package p;

public class R {
    boolean zf; int fi; Object o2; int[] arr = new int[1];
    Object value() { return o2; }
    boolean zc() { return zf; }
    int len() { return fi; }
    boolean m1() { Object v = value(); if (v == null | v instanceof String) return true; return false; }
    boolean m2() { Object v = value(); int z = 1; if (v == null | v instanceof String) return true; return false; }
    boolean m3(Object v) { if (v == null | v instanceof String) return true; return false; }
    boolean m4() { Object v = value(); if (v != null & zf) return true; return false; }
    boolean m5() { Object v = o2; if (v == null | v instanceof String) return true; return false; }
    boolean m6(int i) { int k = len(); if (i > 0 & zf) return true; return false; }
    boolean m7(int i) { len(); if (zf & zf) return true; return false; }
    boolean m8(int i) { len(); if (i > 0 & i < 9) return true; return false; }
    boolean m9(int i) { len(); if (zf & i < 9) return true; return false; }
    boolean m10(int i) { len(); if (zf & zc()) return true; return false; }
    boolean m11(Object v) { if (v == null | v.hashCode() > 0) return true; return false; }
    boolean m12(Object v) { if (zc() & v == null) return true; return false; }
    boolean m13(Object v) { if (v == null & zc()) return true; return false; }
    boolean m14(Object v, int i) { if (v == null & i > 0 & zc()) return true; return false; }
    boolean m15(Object v, int i) { if (i > 0 & v == null & v.hashCode() > 0) return true; return false; }
    boolean m16(int i) { if (len() > i & zf) return true; return false; }
    boolean m17(int i) { if (i > len() & zf) return true; return false; }
    boolean m18(int i) { if (zf & len() > i) return true; return false; }
    boolean m19(int i) { if (zf & i > len()) return true; return false; }
    boolean m20(int i) { if (zf & len() == 0) return true; return false; }
    boolean m21(int i) { if (zf & len() != i) return true; return false; }
    boolean m22(Object v) { if (zf & v.equals(o2) == false) return true; return false; }
    boolean m23(Object v) { if (zf & !v.equals(o2)) return true; return false; }
    boolean m24(int i) { if (zf & arr[i] > 0) return true; return false; }
    boolean m25(int i) { if (zf & arr[i] > i) return true; return false; }
    boolean m26(int i) { if (zf & 10 % i > 0) return true; return false; }
    boolean m27(int i) { if (zf & 10 / i > i) return true; return false; }
    boolean m28(long i) { if (zf & 10 / i > 0) return true; return false; }
    boolean m29(int i) { if (zf & arr.length > 0) return true; return false; }
    boolean m30(Object v) { if (zf & v.hashCode() > 0 & zf) return true; return false; }
    boolean m31(Object v) { if (v.hashCode() > 0 & v == null) return true; return false; }
    boolean m32(int i, int j) { if (zf & i > j) return true; return false; }
    boolean m33(int i) { if (zf & len() > 0) { return true; } else if (zf & i > 0) { return true; } return false; }
    boolean m34(Object v) { int h = v.hashCode(); if (h > 0 & zf) return true; return false; }
    boolean m35(Object v) { value(); return v == null | v instanceof String; }
}
