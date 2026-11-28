package p;
import java.util.*; import java.math.BigDecimal;
public class A {
    int[] arr = new int[10]; List<String> list; int fi; static void take(int i) {} void own(int i) {}
    Object c1(Object o, int n) { take(o.hashCode() % n); return null; }
    Object c2(Object o, int n) { own(o.hashCode() % n); return null; }
    Object c3(Object o, int n) { return o.hashCode() % n < 0; }
    Object c4(Object o, int n) { fi = o.hashCode() % n; return null; }
    Object c5(Object o, int n) { arr[o.hashCode() % n] = 1; return null; }
    Object c6(Object o, int n) { return arr[o.hashCode() % n + 1]; }
    Object c7(Object o, int n) { return String.valueOf(o.hashCode() % n); }
    Object c8(Object o, int n) { return new int[o.hashCode() % n]; }
    Object c9(Object o, int n) { return Integer.valueOf(o.hashCode() % n); }
    Object c10(Object o, long n) { return arr[(int) (o.hashCode() % n)]; }
    Object c11(Object o, int n) { int i = o.hashCode() % n; i++; return arr[i]; }
    Object c12(Object o, int n) { int i = o.hashCode() % n; return i < 0 ? arr[-i] : arr[i]; }
    Object c13(Object o, int n) { int h = o.hashCode(); return arr[h % n]; }
    Object c14(Random r, int n) { take(r.nextInt() % n); return null; }
    Object c15(Random r, int n) { return r.nextInt() % n; }
    Object c16(Object o, int n) { int i = o.hashCode() % n; if (i < 0) i = -i; return arr[i]; }
    Object c17(double d) { return new BigDecimal(d); }
    Object c18(Object o) { return new BigDecimal(0.1); }
    Object c19(Object o) { return new BigDecimal(1.0); }
    Object c20(Object o) { return new BigDecimal(2.5); }
    Object c21(Object o) { return new BigDecimal(0.5); }
    Object c22(Object o) { return new BigDecimal(1.1); }
    Object c23(Object o) { return new BigDecimal(100.0); }
    Object c24(Object o) { return new BigDecimal(0.1f); }
    Object c25(Object o) { return new BigDecimal(1); }
    Object c26(Object o) { return new BigDecimal(0.1, java.math.MathContext.DECIMAL64); }
    Object c27(Object o) { return new BigDecimal(1e-3); }
    Object c28(Object o) { return new BigDecimal(Math.PI); }
    Object c29(Object o) { return new BigDecimal(1.0 / 3); }
    Object c30(Object o) { return BigDecimal.valueOf(0.1); }
    Object c31(Object o) { return new BigDecimal(0.25); }
    Object c32(Object o) { return new BigDecimal(-0.1); }
    Object c33(Object o) { return new BigDecimal(123.456); }
    Object c34(Object o) { return new BigDecimal(1.0E10); }
    Object c35(Object o) { return new BigDecimal(0.3333333333333333); }
    Object c36(Object o) { return new BigDecimal(Double.MAX_VALUE); }
    Object c37(Object o) { return new BigDecimal(0.0); }
}
