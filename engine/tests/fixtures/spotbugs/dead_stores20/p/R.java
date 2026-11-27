package p;
import java.util.Random;
public class R {
    int t() { Random r; return (r = new Random()).nextInt(); }
    int t2() { int a; int b = (a = 5) + 1; return b; }
    int t3(int x) { int a; return (a = x * 2) + 1; }
    int t4(int x) { int a; int b; b = (a = x) + 1; return b; }
    void t5(int x) { int a; foo(a = x); }
    void t6(int x) { int a; int b; a = b = x; foo(b); }
    void t7(int x) { int a; int b; a = b = x; foo(a); }
    int t8(int x) { int a; if ((a = x) > 3) return 1; return 0; }
    int t9(int[] xs) { int a; return xs[a = 2]; }
    String t10(Object o) { String s; return (s = o.toString()).trim(); }
    void foo(int x) {}
}
