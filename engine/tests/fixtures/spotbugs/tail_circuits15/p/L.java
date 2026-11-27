package p;
public class L {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    static boolean sf = a() & b(null);
}
