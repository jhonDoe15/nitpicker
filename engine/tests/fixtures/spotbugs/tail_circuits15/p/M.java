package p;
public class M {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    { if (a() & b(null)) System.out.println(); }
}
