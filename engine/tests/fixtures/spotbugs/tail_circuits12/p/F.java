package p;
public class F {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    static int zz = 1;
    static { if (a() & b(null)) System.out.println(); }
}
