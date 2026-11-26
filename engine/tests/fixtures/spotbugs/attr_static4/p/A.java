package p;
import java.util.*;
public class A {
    public static int t1 = 1;
    public static String t2 = "";
    public static Integer t3 = 1;
    public static Object t4 = new Object();
    public static List<String> t5 = new ArrayList<>();
    public static Date t6 = new Date();
    public static A t7 = new A();
    public static Class<?> t8 = A.class;
    public static Object t9;
    public static Object t10;
    public static boolean t11 = true;
    public static Runnable t12 = null;
    public static Object t13 = null;
    public static Object t14 = "s";
    static { t9 = new Object(); try { t10 = new Object(); } catch (RuntimeException e) { throw e; } }
    void r() {
        Object[] all = { t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14 };
    }
}
