package p;

import java.util.*;

public class A {
    int h;
    int k;
    List<String> list;
    String s;
    static void foo() {}

    A(int x, byte t) { System.out.println(h); }
    A(String x, byte t) { System.out.println(h); }
    A(int x, short t) { int z = h + 1; System.out.println(z); }
    A(String x, short t) { int z = h + 1; System.out.println(z); }
    A(List<String> x, byte t) { System.out.println(list.size()); }
    A(String x, char t) { System.out.println(list.size()); }
    A(String x, long t) { Object q = list; System.out.println(q); }
    A(List<String> x, long t) { Object q = list; System.out.println(q); }
    A(int x, long t) { System.out.println(); System.out.println(h); }
    A(int x, float t) { Objects.requireNonNull(x); System.out.println(h); }
    A(int x, double t) { foo(); System.out.println(h); }
    A(int x, boolean t) { if (t) { System.out.println(h); } }
    A(long x, byte t) { System.out.println(h); }
    A(Integer x, byte t) { System.out.println(h); }
    A(int x, int[] t) { k = h; }
    A(int x, long[] t) { k = h; h = x; }
    A(byte x, long[] t) { k = h; }
    A(String x, int[] t) { s = s + x; }
    A(Object x, int[] t) { s = s + x; }
    A(String x, String t) { System.out.println(s.length()); }
    A(String x, Object t) { System.out.println(s.length()); }
    A(Object x, Object t) { System.out.println(s); }
    A(CharSequence x, Object t) { System.out.println(s); }
    A(String x, List<String> t) { System.out.println(t.size() + s.length()); }
    A(int x, Object t) { int a = 0; while (a < 3) { a++; } System.out.println(h); }
}
