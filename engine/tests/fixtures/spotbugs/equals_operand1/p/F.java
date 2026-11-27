package p;
import java.util.*;
public class F implements Comparable<F> {
    double v; float w; int i; long l;
    public int compareTo(F o) { return v > o.v ? 1 : v < o.v ? -1 : 0; }
}
class F2 implements Comparator<F> {
    public int compare(F a, F b) { return a.w < b.w ? -1 : a.w > b.w ? 1 : 0; }
}
class F3 implements Comparator<F> {
    public int compare(F a, F b) { if (a.v < b.v) return -1; if (a.v > b.v) return 1; return 0; }
}
class F4 implements Comparator<F> {
    public int compare(F a, F b) { return a.i > b.i ? 1 : a.i < b.i ? -1 : 0; }
}
class F5 implements Comparator<F> {
    public int compare(F a, F b) { return Double.compare(a.v, b.v); }
}
class F6 implements Comparator<F> {
    public int compare(F a, F b) { return a.i == 0 ? Integer.MIN_VALUE : 1; }
}
class F7 implements Comparable<F7> {
    int x;
    public int compareTo(F7 o) { if (x == 1) return Integer.MIN_VALUE; return 0; }
}
class F8 {
    double v;
    public int compareTo(F8 o) { return v > o.v ? 1 : v < o.v ? -1 : 0; }
    public int compare(F8 a, F8 b) { return a.v > b.v ? 1 : -1; }
    public int other(F8 a, F8 b) { return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
}
class F9 implements Comparator<F> {
    public int compare(F a, F b) { double x = a.v, y = b.v; return x > y ? 1 : (x < y ? -1 : 0); }
}
class F10 implements Comparator<F> {
    public int compare(F a, F b) { return a.l > b.l ? 1 : a.l < b.l ? -1 : 0; }
}
class F11 implements Comparator<F> {
    public int compare(F a, F b) { return a.v >= b.v ? (a.v == b.v ? 0 : 1) : -1; }
}
class F12 implements Comparator<F> {
    public int compare(F a, F b) { return a.v > b.v ? 1 : 0; }
}
class F13 implements Comparator<F> {
    public int compare(F a, F b) { return a.v == b.v ? 0 : 1; }
}
class F14 implements Comparator<F> {
    public int compare(F a, F b) { int r = 0; if (a.v > b.v) r = 1; else if (a.v < b.v) r = -1; return r; }
}
class F15 implements Comparator<F> {
    Comparator<F> c = (a, b) -> a.v > b.v ? 1 : a.v < b.v ? -1 : 0;
    public int compare(F a, F b) { return -compareInts(a.i, b.i); }
    static int compareInts(int a, int b) { return a - b; }
}
class F16 implements Comparator<F> {
    public int compare(F a, F b) { return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
    public int compare2(F a, F b) { return Integer.MIN_VALUE; }
}
