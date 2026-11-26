package p;
import java.io.Serializable;
public class C11 implements Serializable {
    static void f() {
        // comment
        /* c */ ;
        ;
        class L { void k() {} }
        new Thread(() -> {}).start();
    }
    private C11() {
    }
    private static C11 inst;
    public static synchronized C11 get() {
        if (inst == null) inst = new C11();
        return inst;
    }
}
