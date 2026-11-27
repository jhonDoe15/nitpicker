package p;

public class W {
    boolean zf; int fi; Object o2; String s = ""; static boolean SZ; boolean[] ba = new boolean[1];
    Object value() { return o2; }
    int len() { return fi; }
    boolean w1(Object v) { value(); fi = 1; if (v == null | v instanceof String) return true; return false; }
    boolean w2(Object v) { value(); fi = 1; fi = 2; fi = 3; fi = 4; fi = 5; fi = 6; if (v == null | v instanceof String) return true; return false; }
    boolean w3(Object v) { value(); fi = 1; fi = 2; fi = 3; fi = 4; fi = 5; fi = 6; fi = 7; fi = 8; fi = 9; fi = 10; fi = 11; fi = 12; fi = 13; fi = 14; fi = 15; fi = 16; fi = 17; fi = 18; fi = 19; fi = 20; if (v == null | v instanceof String) return true; return false; }
    boolean w4(Object v, int i) { value(); if (i > 3) fi = 1; if (v == null | v instanceof String) return true; return false; }
    boolean w5(Object v, int i) { value(); for (int k = 0; k < i; k++) fi++; if (v == null | v instanceof String) return true; return false; }
    boolean w6(Object v) { value(); boolean t = fi > 0; if (v == null | v instanceof String) return true; return t; }
    boolean w7(int i) { return i > 0 & s.length() > i; }
    boolean w8(int i) { if (i > 0 & s.length() > i) return true; return false; }
    boolean w9(int i) { return zf & s.length() > i; }
    boolean w10(int i) { return zf & o2.hashCode() > i; }
    boolean w11(int i) { return zf & len() > i; }
    void w12(Object v) { SZ = v != null & v.hashCode() > 0; }
    void w13(Object v) { ba[0] = v != null & v.hashCode() > 0; }
    void w14(Object v) { zf = v != null & v.hashCode() > 0; }
    boolean w15(Object v) { return (v != null & v.hashCode() > 0) ^ zf; }
    void w16(Object v) { SZ = v == null | v.hashCode() > 0; }
    java.util.function.Predicate<Object> w17() { return v -> v != null & v.hashCode() > 0; }
    Boolean w18(Object v) { return v != null & v.hashCode() > 0; }
    boolean w19(Object v) { boolean r = v != null & v.hashCode() > 0; return r; }
    boolean w20(Object v) { value(); try { fi = 1; } finally { fi = 2; } if (v == null | v instanceof String) return true; return false; }
    boolean w21(Object v) { if (fi > 0) { value(); } if (v == null | v instanceof String) return true; return false; }
    boolean w22(Object v) { if (fi > 0) { return value() == null; } if (v == null | v instanceof String) return true; return false; }
    boolean w23(Object v) { value(); if (zf) fi = 1; if (v == null | v instanceof String) return true; return false; }
    boolean w24(Object v) { boolean t = value() == null; if (v == null | v instanceof String) return true; return t; }
}
