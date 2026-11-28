package p;
import java.util.*;
class V { double v; double u; float w; int i; Double bv; double[] arr; V next; double get() { return v; } static double sv; }
class F7 implements Comparable<F7> {
    int x;
    public int compareTo(F7 o) { if (x == 1) return Integer.MIN_VALUE; return 0; }
}
class F7b implements Comparable<F7b> {
    int x;
    public int compareTo(F7b o) { if (x == 1) return Integer.MIN_VALUE; return 1; }
}
class F7c implements Comparable<F7c> {
    int x;
    public int compareTo(F7c o) { if (o.x == 1) return Integer.MIN_VALUE; return 0; }
}
class F7d implements Comparator<V> {
    public int compare(V a, V b) { if (a.i == 1) return Integer.MIN_VALUE; return 0; }
}
class F7e implements Comparator<V> {
    public int compare(V a, V b) { if (a.i == 1) return 0; return Integer.MIN_VALUE; }
}
class F7f implements Comparator<V> {
    public int compare(V a, V b) { return -2147483648; }
}
class F7g {
    public int compareTo(Object o) { return Integer.MIN_VALUE; }
    public int compare(Object a, Object b) { return Integer.MIN_VALUE; }
}
class F7h implements Comparator<V> {
    public int compare(V a, V b) { if (a.i == 1) return Integer.MIN_VALUE; if (a.i == 2) return Integer.MIN_VALUE; return 3; }
}
class P1 implements Comparator<V> {
    public int compare(V a, V b) { return a.v > a.u ? 1 : a.v < a.u ? -1 : 0; }
}
class P2 implements Comparator<V> {
    public int compare(V a, V b) { double x = a.v; return x > b.v ? 1 : x < b.v ? -1 : 0; }
}
class P3 implements Comparator<V> {
    public int compare(V a, V b) { return 0 < a.v ? 1 : 0 > a.v ? -1 : 0; }
}
class P4 implements Comparator<V> {
    public int compare(V a, V b) { return a.get() > b.get() ? 1 : a.get() < b.get() ? -1 : 0; }
}
class P5 implements Comparator<V> {
    public int compare(V a, V b) { return a.arr[0] > b.arr[0] ? 1 : a.arr[0] < b.arr[0] ? -1 : 0; }
}
class P6 implements Comparator<V> {
    public int compare(V a, V b) { return V.sv > b.v ? 1 : V.sv < b.v ? -1 : 0; }
}
class P7 implements Comparator<V> {
    public int compare(V a, V b) { return a.next.v > b.next.v ? 1 : a.next.v < b.next.v ? -1 : 0; }
}
class P8 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        if (a.v < b.v) return -1;
        if (a.v == b.v) return 0;
        return 5;
    }
}
class P9 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        if (a.u > b.u) return 1;
        if (a.v < b.v) return -1;
        if (a.u < b.u) return -1;
        return 0;
    }
}
class P10 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        a = b;
        if (a.v < b.v) return -1;
        return 0;
    }
}
class P11 implements Comparator<V> {
    public int compare(V a, V b) {
        return a.v
            >
            b.v ? 1 :
            a.v
            <
            b.v ? -1 : 0;
    }
}
class P12 implements Comparator<V> {
    public int compare(V a, V b) {
        double d = a.v - b.v;
        return d > 0 ? 1 : d < 0 ? -1 : 0;
    }
}
class P13 implements Comparator<V> {
    public int compare(V a, V b) {
        return (int) Math.signum(a.v - b.v) + (a.w > b.w ? 1 : 0) + (a.w > b.w ? 1 : 0);
    }
}
class P14 implements Comparator<V> {
    public int compare(V a, V b) {
        Runnable r = () -> { double x = 1, y = 2; boolean c = x > y || x < y; };
        return a.v > b.v ? 1 : 0;
    }
}
class P15 implements Comparator<V> {
    public int compare(V a, V b) {
        for (int k = 0; k < 2; k++) { if (a.v > b.v) return 1; }
        return 0;
    }
}
class P16 implements Comparator<V> {
    public int compare(V a, V b) {
        V c = a;
        if (a.v > b.v) return 1;
        if (c.v < b.v) return -1;
        return 0;
    }
}
