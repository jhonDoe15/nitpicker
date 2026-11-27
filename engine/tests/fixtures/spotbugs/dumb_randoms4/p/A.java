package p;
import java.util.*; import java.math.BigDecimal;
public class A {
    int[] arr = new int[10]; List<String> list; ArrayList<String> al; Vector<String> v; static final double K = 0.1;
    Object c1(Object o, int n) { return list.set(o.hashCode() % n, ""); }
    Object c2(Object o, int n) { return list.remove(o.hashCode() % n); }
    Object c3(Object o, int n) { return al.get(o.hashCode() % n); }
    Object c4(Object o, int n) { return v.get(o.hashCode() % n); }
    Object c5(Object o, int n, String s) { return s.charAt(o.hashCode() % n); }
    Object c6(Object o, int n, String s) { return s.substring(o.hashCode() % n); }
    Object c7(Object o, int n, StringBuilder s) { return s.charAt(o.hashCode() % n); }
    Object c8(Object o, int n) { return java.lang.reflect.Array.get(arr, o.hashCode() % n); }
    Object c9(Object o, int n) { return list.subList(0, o.hashCode() % n); }
    Object c10(Object o, int n) { return list.listIterator(o.hashCode() % n); }
    Object c11(Object o, int n) { list.add(o.hashCode() % n, ""); return null; }
    Object c12(Object o, int n, long[] a) { return a[o.hashCode() % n]; }
    Object c13(Object o, int n, Object[] a) { return a[o.hashCode() % n]; }
    Object c14(Object o, int n, byte[] a) { return a[o.hashCode() % n]; }
    Object c15(Object o) { return new BigDecimal(0.12345678); }
    Object c16(Object o) { return new BigDecimal(0.123456789012); }
    Object c17(Object o) { return new BigDecimal(0.1234567890123); }
    Object c18(Object o) { return new BigDecimal(0.12345678901234); }
    Object c19(Object o) { return new BigDecimal(0.123456789012345); }
    Object c20(Object o) { return new BigDecimal(3.1415926535897); }
    Object c21(Object o) { return new BigDecimal(3.14159265358979); }
    Object c22(Object o) { return new BigDecimal(1e-4); }
    Object c23(Object o) { return new BigDecimal(1.5e-7); }
    Object c24(Object o) { return new BigDecimal(12345678.9); }
    Object c25(Object o) { return new BigDecimal(K); }
    Object c26(Object o) { return new BigDecimal(0.7); }
    Object c27(Object o) { return new BigDecimal(1234567.1); }
    Object c28(Object o) { return new BigDecimal(0.01); }
    Object c29(Object o) { return new BigDecimal(99.99); }
    Object c30(Object o) { return new BigDecimal(1.23456789012); }
    Object c31(Object o) { return new BigDecimal(12.3456789012); }
    Object c32(Object o) { return new BigDecimal(1.2345678901234); }
}
