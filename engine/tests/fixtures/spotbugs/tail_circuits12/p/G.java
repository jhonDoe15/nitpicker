package p;
public class G {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    G() { if (a() & b(null)) System.out.println(); }
    boolean f = a() & b(null);
}
