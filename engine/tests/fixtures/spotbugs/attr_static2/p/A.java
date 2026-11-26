package p;
import java.util.*;
public class A {
    public static int r1 = 1;
    public static int r2 = 1;
    public static int r3 = 1;
    public static int r4 = 1;
    public static int r5 = 1;
    public static int r6 = 1;
    public static int r7 = 1;
    public static int r8 = 1;
    public static int w1 = 1;
    public static int w2 = 1;
    public static int w3 = 1;
    public static int w4;
    public static int[] a1 = {1};
    public static int[] a2 = {1};
    public static final int[] a3 = {1};
    public static final int[] a4 = {1};
    public static int r9 = 1;
    public static int r10 = 1;
    static int x = r3;
    static void s() { int y = r2; }
    int i() { return r1; }
    void lam() { Runnable q = () -> System.out.println(r4); }
    class In { int g() { return r5; } }
    void wr() { w1 = r6; w2++; w3 += 1; w4 = 3; int z = w4; }
    int ar() { return a2[0] + a4[0]; }
    void ar2() { a1[0] = 1; }
    A() { int u = r9; }
    void rr() { r10 = r10; }
}
class B {
    int g() { return A.r7; }
}
