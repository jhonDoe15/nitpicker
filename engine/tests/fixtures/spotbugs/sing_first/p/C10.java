package p;
import java.io.Serializable;
public class C10 implements Serializable {
    static int f(int a) {
        switch (a) {
            case 1: return 2;
            default: return 3;
        }
    }
    static void g() throws Exception {
        try (java.io.StringReader r = new java.io.StringReader("")) {
            r.read();
        }
    }
    static void h() {
        try {
        } finally {
            System.out.println();
        }
    }
    private C10() {
    }
    private static C10 inst;
    public static synchronized C10 get() {
        if (inst == null) inst = new C10();
        return inst;
    }
}
