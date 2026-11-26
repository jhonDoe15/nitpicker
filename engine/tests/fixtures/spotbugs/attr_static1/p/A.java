package p;
import java.util.*;
public class A {
    public static int i1 = 1;
    public static Integer i2 = 2;
    public static String s1 = "a";
    public static Object o1 = new Object();
    public static List<String> l1 = new ArrayList<>();
    public static int[] a1 = {1};
    public static Hashtable<String, String> h1 = new Hashtable<>();
    protected static int p1 = 1;
    static int k1 = 1;
    public static int late;
    public static int nev;
    public static int blk;
    static {
        late = 5;
        blk
          = 6;
    }
    public static int wm = 1;
    public static int outside = 1;
    public static volatile int vol = 1;
    public static int pr = 1;
    protected static int pw = 1;
    void w() { wm = 2; pw = 3; }
    public static final int[] fa = {1};
    public static final List<String> fl = new ArrayList<>();
    public static int rd = 1;
    int r() { return rd + pr; }
    public static class N { public static int n = 1; public static int nw = 1; void w() { nw = 2; } }
    private static class Q { public static int q = 1; }
}
class B {
    public static int b = 1;
    void w() { A.outside = 3; }
}
