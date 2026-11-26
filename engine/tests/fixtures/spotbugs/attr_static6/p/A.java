package p;
public class A {
    public static int w1 = 1;
    public static int w2 = 1;
    public static int w3 = 1;
    public static int w4 = 1;
    public static final int[] a1 = {1};
    public static final int[] a2 = {1};
    public static int[] a3 = {1};
    public static int[] a4 = {1};
    public static int s1 = 1;
    void w() { w1 = 2; w2 = 2; int x = w1 + w2 + a1[0] + a3[0] + s1; }
}
class B { void w() { A.w3 = 2; int y = A.w3 + A.w4; } }
