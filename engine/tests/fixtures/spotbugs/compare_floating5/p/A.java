package p;
import java.util.*;
class V { double v; double u; int i; float w; }
class S1 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        if (a.v > b.v) return 2;
        return 0;
    }
}
class S2 implements Comparator<V> {
    public int compare(V a, V b) {
        int r = (a.w > b.w ? 1 : 0) + (a.w > b.w ? 1 : 0);
        return r;
    }
}
class S3 implements Comparator<V> {
    public int compare(V a, V b) {
        int r = (int) Math.signum(a.v - b.v) + (a.w > b.w ? 1 : 0) + (a.w > b.w ? 1 : 0);
        return r;
    }
}
class S4 implements Comparator<V> {
    public int compare(V a, V b) { return 0; }
    public int compare(V a) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > a.u ? 1 : a.v < a.u ? -1 : 0; }
    public int compare() { double x = 1, y = 2; if (x == 0) return 0; return x > y ? 1 : x < y ? -1 : 0; }
}
class S5 implements Comparable<S5> {
    double v;
    public int compareTo(S5 o) { return 0; }
    public int compareTo() { double x = 1, y = 2; return x > y ? 1 : x < y ? -1 : 0; }
    public int compareTo(S5 o, S5 p) { return v > o.v ? 1 : v < o.v ? -1 : 0; }
}
class S6 implements Comparable<S6>, Comparator<V> {
    double v;
    public int compareTo(S6 o) { return v > o.v ? 1 : v < o.v ? -1 : 0; }
    public int compare(V a, V b) { return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
}
class S7 implements Comparable<S7> {
    double v;
    public int compareTo(S7 o) { return v > o.v ? 1 : v < o.v ? -1 : 0; }
    public static int compareTo(double x, double y) { return x > y ? 1 : x < y ? -1 : 0; }
    public synchronized int compare(S7 a, S7 b) { return 0; }
}
class S8 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) {
            return 1;
        }
        return a.v < b.v ? -1 : (a.v == b.v ? 0 : 5);
    }
}
class S2b implements Comparator<V> {
    public int compare(V a, V b) { int r = (a.v > b.v ? 1 : 0) + (a.v > b.v ? 1 : 0); return r; }
}
class S2c implements Comparator<V> {
    public int compare(V a, V b) { int r = a.w > b.w ? 1 : 0; r += a.w > b.w ? 1 : 0; return r; }
}
class S2d implements Comparator<V> {
    public int compare(V a, V b) { int r = (a.v > b.v ? 1 : 0) + (a.v < b.v ? 1 : 0); return r; }
}
class S2e implements Comparator<V> {
    public int compare(V a, V b) { return (a.v > b.v ? 1 : 0) - (a.v < b.v ? 1 : 0); }
}
class S2f implements Comparator<V> {
    public int compare(V a, V b) { int r = 0; r = a.v > b.v ? 1 : 0; int q = a.v < b.v ? 1 : 0; return r - q; }
}
class S9 implements Comparator<V> {
    public int compare(V a, V b) { int r = 7 + (a.v > b.v ? 1 : 0); if (a.v < b.v) return -1; return r; }
}
class S10 implements Comparator<V> {
    public int compare(V a, V b) { int r = 7 + (a.v > b.v ? 1 : 0); if (a.v < b.v) return -1; if (a.v == b.v) return 0; return r; }
}
class S11 implements Comparator<V> {
    public int compare(V a, V b) { foo(a.v > b.v ? 1 : 0, a.v < b.v ? 1 : 0); return 0; }
    void foo(int x, int y) {}
}
class S12 implements Comparator<V> {
    public int compare(V a, V b) { if (a.v > b.v) return 1; foo(a.v < b.v); return 0; }
    void foo(boolean x) {}
}
class S13 implements Comparator<V> {
    public int compare(V a, V b) { if (a.v > b.v) return 1; return this.foo(a.v < b.v); }
    int foo(boolean x) { return 0; }
}
