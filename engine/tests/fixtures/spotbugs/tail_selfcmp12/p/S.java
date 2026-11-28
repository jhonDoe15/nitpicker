package p;

import java.util.*;

public class S {
    int f; static int st;
    boolean c1(String v) { return v.endsWith(v); }
    int c2(String v) { return v.indexOf(v); }
    int c3(String v) { return v.lastIndexOf(v); }
    boolean c4(String v) { return v.matches(v); }
    boolean c5(List<String> v) { return v.removeAll(v); }
    boolean c6(List<String> v) { return v.retainAll(v); }
    boolean c7(List<String> v) { return v.containsAll(v); }
    boolean c8(Date v) { return v.after(v); }
    int c9(Comparator<String> c, String v) { return c.compare(v, v); }
    boolean c10(int[] v) { return Arrays.equals(v, v); }
    boolean c11(Object v) { return Objects.deepEquals(v, v); }
    boolean c12(Set<String> v) { return v.addAll(v); }
    boolean c13(List<String> v) { return v.contains(v); }
    boolean c14(Map<String, String> v) { return v.containsKey(v); }
    boolean c15(String v) { return v.contentEquals(v); }
    String c16(String v) { return v.concat(v); }
    boolean c17(String v) { return v.equalsIgnoreCase(v); }
    boolean c18(Object v) { return v.equals(v) || v.hashCode() == 0; }
    <T extends Comparable<T>> int c19(T v) { return v.compareTo(v); }
    boolean c20(StringBuilder v) { return v.equals(v); }
    boolean c21(CharSequence v) { return v.equals(v); }
    boolean c22(Object v) { boolean r = v.equals(v); return r; }
    void c23(Object v) { v.equals(v); }
    boolean c24(String[] v) { return v[0].equals(v[0]); }
    boolean c25(String v) { return v.regionMatches(0, v, 0, 1); }
    boolean c26(java.io.File v) { return v.equals(v); }
}
class T extends S {
    int g;
    boolean d1() { return f == f; }
    boolean d2() { return g == super.f; }
    boolean d3() { return super.f == this.f; }
    boolean d4() { return st == st; }
    boolean d5() { return S.st == T.st; }
    int d6() { return f - f; }
}
class U {
    boolean e1() { return S.st == S.st; }
    boolean e2(T t) { return t.f == t.f; }
    boolean e3(S t) { return t.f == t.f; }
}
