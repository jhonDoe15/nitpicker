package p;
import java.util.*;
class V { double v; double u; float w; int i; Double bv; }
class M1 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.i == 0) return Integer.MIN_VALUE;
        return 1;
    }
}
class M2 implements Comparable<M2> {
    public int compareTo(M2 o) { return Integer.MIN_VALUE; }
}
class M3 implements Comparator<String> {
    public int compare(String a, String b) { return a.length() > b.length() ? Integer.MIN_VALUE : 0; }
}
class M4 implements Comparator<V> {
    public int compare(V a, V b) { int r = Integer.MIN_VALUE; return r; }
}
class C1 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v < b.u) return -1;
        if (a.w > b.w) return 1;
        return 0;
    }
}
class C2 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > 0) return 1;
        if (a.v < 0) return -1;
        return 0;
    }
}
class C3 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v == b.v) return 0;
        if (a.v != b.v) return 1;
        return 0;
    }
}
class C4 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v < b.v)
            return -1;
        else if (a.v > b.v)
            return 1;
        return 0;
    }
}
class C5 implements Comparator<V> {
    public int compare(V a, V b) {
        return a.bv > b.bv ? 1 : a.bv < b.bv ? -1 : 0;
    }
}
class C6 implements Comparator<V> {
    public int compare(V a, V b) {
        return a.v > b.v ? 2 : a.v < b.v ? -2 : 0;
    }
}
class C7 implements Comparator<V> {
    public int compare(V a, V b) {
        boolean g = a.v > b.v;
        boolean l = a.v < b.v;
        return g ? 1 : l ? -1 : 0;
    }
}
class C8 {
    static int compare(double x, double y) { return x > y ? 1 : x < y ? -1 : 0; }
    int compareTo(Object o) { double x = 1, y = 2; return x > y ? 1 : x < y ? -1 : 0; }
}
class C9 implements Comparator<V> {
    public int compare(V a, V b) { return a.v < b.v ? -1 : a.v > b.v ? 1 : 0; }
    public int compareTo(V a) { double x = 1, y = 2; return x > y ? 1 : x < y ? -1 : 0; }
    public int compare(V a, V b, V c) { return a.v < b.v ? -1 : a.v > b.v ? 1 : 0; }
    public int compare(double x, double y) { return x > y ? 1 : x < y ? -1 : 0; }
}
class C10 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        foo();
        if (a.v < b.v) return -1;
        return 0;
    }
    void foo() {}
}
class C11 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        if (a.v < b.v) return -1;
        if (a.w > b.w) return 1;
        if (a.w < b.w) return -1;
        return 0;
    }
}
class C12 implements Comparator<V> {
    public int compare(V a, V b) {
        return a.v > b.v ? -1 : a.v < b.v ? 1 : 0;
    }
}
class C13 implements Comparator<V> {
    public int compare(V a, V b) {
        return a.v > b.v ? 1 : a.v < b.v ? 0 : -1;
    }
}
class C14 implements Comparator<V> {
    public int compare(V a, V b) {
        return a.v > b.v ? 1 : b.v > a.v ? -1 : 0;
    }
}
class C15 implements Comparator<V> {
    public int compare(V a, V b) {
        return (a.v > b.v) ? 1 : -1;
    }
}
