package p;
import java.io.Serializable;
public class C9 implements Serializable {
    static void f() {
        int a;
        a = 3;
        int b;
        String s = null,
               t = "x";
    }
    static void g() {
        synchronized (inst) { System.out.println(); }
    }
    static void g2() {
        label:
        while (true) { break label; }
    }
    private C9() {
    }
    private static C9 inst;
    public static synchronized C9 get() {
        if (inst == null) inst = new C9();
        return inst;
    }
}
