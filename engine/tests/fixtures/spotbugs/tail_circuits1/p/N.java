package p;

public class N {
    int f; boolean b; Object o; int[] arr = new int[1]; String s = "";
    boolean check() { return f > 0; }
    static boolean sc() { return true; }
    boolean n1(Object x) { return x != null & x.hashCode() > 0; }
    boolean n2(Object x) { if (x != null & x.hashCode() > 0) return true; return false; }
    boolean n3(Object x) { return x == null | x.hashCode() > 0; }
    boolean n4(Object x) { if (x == null | x.hashCode() > 0) return true; return false; }
    boolean n5(boolean a) { return a | check(); }
    boolean n6(boolean a) { if (a | check()) return true; return false; }
    boolean n7(int[] a) { if (a.length > 0 | a[0] > 0) return true; return false; }
    boolean n8(int[] a) { return a.length > 0 & a[0] > 0; }
    boolean n9(Object x) { return x instanceof String & ((String) x).isEmpty(); }
    boolean n10(Object x) { return x instanceof String & x.hashCode() > 0; }
    boolean n11(Object x) { return x instanceof String & f > 0; }
    boolean n12(Object x) { return x instanceof String & b; }
    boolean n13(int i) { return i > 0 & i < 10; }
    boolean n14(int i) { return i > 0 & sc(); }
    boolean n15(Object x) { return x != null & b; }
    boolean n16(Object x) { return x != null & f > 0; }
    boolean n17(Object x) { return x != null & x.equals(o); }
    boolean n18(int i) { return i > 0 & arr[i] > 0; }
    boolean n19(int i) { return i > 0 & s.length() > i; }
    boolean n20(int i, int j) { return i / j > 0 & j != 0; }
    boolean n21(Object x) { return x != null & check(); }
    boolean n22(boolean a, boolean c) { return a & c & check(); }
    boolean n23(boolean a) { return check() & a; }
    boolean n24(Object x) { boolean r = x != null; r &= x.hashCode() > 0; return r; }
    boolean n25(Object x) { return (x != null) & (x.hashCode() > 0); }
    boolean n26(Object x) { return x == null | x.equals(o); }
    boolean n27(Object x) { return !(x instanceof String) | ((String) x).isEmpty(); }
    boolean n28(Object x) { return x != null & sc(); }
    boolean n29(int i) { return i > 0 & i / 2 > 0; }
    boolean n30(int i) { return i > 0 & 10 / i > 0; }
    boolean n31(Object x) { return x instanceof String & x instanceof CharSequence; }
    boolean n32(boolean a, boolean c) { return a & !c; }
    boolean n33(Object x) { return x != null & (x.hashCode() > 0 | b); }
    void n34(Object x) { boolean r = (x != null) & (x.hashCode() > 0); f = r ? 1 : 0; }
    boolean n35(Object x) { while (x != null & x.hashCode() > 0) { x = null; } return true; }
    boolean n36(Boolean a, boolean c) { return a & c; }
    boolean n37(boolean a, Object x) { return a & x.hashCode() > 0; }
    boolean n38(boolean a) { return a & arr.length > 0; }
    boolean n39(boolean a) { return a & o == null; }
}
