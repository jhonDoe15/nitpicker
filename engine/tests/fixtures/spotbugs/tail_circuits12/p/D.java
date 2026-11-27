package p;
public class D {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    static { if (a() & b(null)) System.out.println(); }
}
