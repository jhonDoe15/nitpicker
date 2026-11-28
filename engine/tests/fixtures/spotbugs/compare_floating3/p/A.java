package p;
import java.util.*;
class V { double v; double u; float w; int i; boolean flag; }
class Ma implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i > b.i) return Integer.MIN_VALUE; return 0; }
}
class Mb implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i != 1) return Integer.MIN_VALUE; return 0; }
}
class Mc implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.flag) return Integer.MIN_VALUE; return 0; }
}
class Md implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a == null) return Integer.MIN_VALUE; return 0; }
}
class Me implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i == 1) { foo(); return Integer.MIN_VALUE; } return 0; }
}
class Mf implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return 0; }
}
class Mg implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { switch (a.i) { case 1: return Integer.MIN_VALUE; default: return 0; } }
}
class Mh implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { for (int k = 0; k < a.i; k++) foo(); return Integer.MIN_VALUE; }
}
class Mi implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a == b) return Integer.MIN_VALUE; return 1; }
}
class Mj implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { foo(); return Integer.MIN_VALUE; }
}
class Mk implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i == 1) return 0; foo(); return Integer.MIN_VALUE; }
}
class Ml implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i < 1) return 0; if (a.i > 3) return Integer.MIN_VALUE; return 1; }
}
class Mm implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { int k = a.i + 1; if (k == 7) return 0; return Integer.MIN_VALUE; }
}
class Mn implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.i == 1) return 0; return Integer.MIN_VALUE + 0; }
}
class T1 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (!(a.v > b.v)) return -1; return 0; }
}
class T2 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (b.v < a.v) return -1; return 0; }
}
class T3 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (b.v > a.v) return -1; return 0; }
}
class T4 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { boolean g = a.v > b.v; boolean h = a.v >= b.v; return g ? 1 : h ? 0 : -1; }
}
class T5 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) foo(); if (a.v < b.v) foo(); return 0; }
}
class T8 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (a.v <= b.v) return -1; return 0; }
}
class T9 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v < b.v) return 1; if (a.v <= b.v) return -1; return 0; }
}
class T10 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (a.v > b.v) return 2; if (a.v < b.v) return -1; return 0; }
}
class T13 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v != a.v) return 1; if (a.v == a.v) return 2; return 0; }
}
class T14 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (a.v < b.v) return -1; if (a.v >= b.v) return 2; if (a.v <= b.v) return 3; return 0; }
}
class T15 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (a.w < b.w) return -1; if (a.v < b.v) return -1; return 0; }
}
class T16 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { return Double.compare(a.v, b.v) > 0 ? 1 : a.v < b.v ? -1 : 0; }
}
class T17 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; else { if (a.v < b.v) return -1; } return 0; }
}
class T18 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > 0.5) return 1; if (a.v < 0.5) return -1; return 0; }
}
class T19 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > 0.5) return 1; if (a.v < 0.6) return -1; return 0; }
}
class T20 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v) return 1; if (a.v < b.u) return -1; return 0; }
}
class T21 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.w > b.w) return 1; if (a.w < b.w) return -1; return 0; }
}
class T22 implements Comparator<V> {
    void foo() {}
    public int compare(V a, V b) { if (a.v > b.v && a.v < b.v) return 1; return 0; }
}
