package p;

public class V {
    boolean zf; int fi; Object o2; String s = ""; Object[] arr = {}; StringBuilder sb = new StringBuilder();
    Object value() { return o2; }
    static Object sm() { return null; }
    private Object priv() { return o2; }
    static int stat() { return 1; }
    boolean r1(Object v) { value(); while (fi < 3) fi++; if (v == null | v instanceof String) return true; return false; }
    boolean r2(Object v) { value(); do { fi++; } while (fi < 3); if (v == null | v instanceof String) return true; return false; }
    boolean r3(Object v) { value(); if (fi > 9) throw new IllegalStateException(); if (v == null | v instanceof String) return true; return false; }
    boolean r4(Object v) { value(); switch (fi) { case 1: fi = 2; break; default: fi = 3; } if (v == null | v instanceof String) return true; return false; }
    boolean r5(Object v) { value(); try { fi = 1; } catch (RuntimeException e) { fi = 2; } if (v == null | v instanceof String) return true; return false; }
    boolean r6(Object v) { value(); synchronized (this) { fi = 1; } if (v == null | v instanceof String) return true; return false; }
    boolean r7(Object v) { value(); try { fi = 1; } finally { fi = 2; } if (v == null | v instanceof String) return true; return false; }
    boolean r8(Object v) { value(); fi = zf ? 1 : 2; if (v == null | v instanceof String) return true; return false; }
    boolean r9(Object v) { value(); if (fi > 9) return false; if (v == null | v instanceof String) return true; return false; }
    boolean r10(Object v) { value(); for (Object x : arr) fi++; if (v == null | v instanceof String) return true; return false; }
    boolean r11(Object v) { value(); assert fi > 0; if (v == null | v instanceof String) return true; return false; }
    boolean r12(Object v) { value(); fi = fi > 0 ? fi : -fi; if (v == null | v instanceof String) return true; return false; }
    boolean r13(Object v) { value();  if (v == null | v instanceof String) return true; return false; }
    boolean r14(Object v) { value(); Object z = null; if (v == null | v instanceof String) return true; return false; }
    boolean r15(Object v) { value(); label: { if (fi > 1) break label; fi = 3; } if (v == null | v instanceof String) return true; return false; }
    boolean c1(Object v) { s.isEmpty(); if (v == null | v instanceof String) return true; return false; }
    boolean c2(Object v) { s.charAt(0); if (v == null | v instanceof String) return true; return false; }
    boolean c3(Object v) { s.hashCode(); if (v == null | v instanceof String) return true; return false; }
    boolean c4(Object v) { Integer.parseInt(s); if (v == null | v instanceof String) return true; return false; }
    boolean c5(Object v) { Math.abs(fi); if (v == null | v instanceof String) return true; return false; }
    boolean c6(Object v) { o2.toString(); if (v == null | v instanceof String) return true; return false; }
    boolean c7(Object v) { sm(); if (v == null | v instanceof String) return true; return false; }
    boolean c8(Object v) { arr.clone(); if (v == null | v instanceof String) return true; return false; }
    boolean c9(Object v) { s.length(); if (v == null | v instanceof String) return true; return false; }
    boolean c11(Object v) { s.trim(); if (v == null | v instanceof String) return true; return false; }
    boolean c12(Object v) { s.equals(s); if (v == null | v instanceof String) return true; return false; }
    boolean c14(Object v) { String.valueOf(fi); if (v == null | v instanceof String) return true; return false; }
    boolean c15(Object v) { sb.append(1); if (v == null | v instanceof String) return true; return false; }
    boolean c18(Object v) { stat(); if (v == null | v instanceof String) return true; return false; }
}
