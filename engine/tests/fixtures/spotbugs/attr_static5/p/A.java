package p;
import java.util.*;
public class A {
    public static Object k1 = new Object();
    public static String k2 = "";
    public static Object k3;
    public static int[] k4 = {};
    public static final int[] k5 = {};
    public static Object k6 = 1;
    public static Object[] k7 = {};
    public static final Object[] k8 = {};
    public static Object k9;
    public static final List<String> k10 = new ArrayList<>();
    public static Hashtable<String,String> k11 = new Hashtable<>();
    public static final Map<String,String> k12 = new HashMap<>();
    static { k6 = 2; if (k1 == null) k9 = 1; else k9 = 2; }
    void w() { k1 = null; k2 = "x"; k3 = this; k4 = null; }
    void r() {
        Object[] all = { k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11, k12 };
    }
}
