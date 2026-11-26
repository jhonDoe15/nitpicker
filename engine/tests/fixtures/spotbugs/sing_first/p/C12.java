package p;
import java.io.Serializable;
public class C12 implements Serializable {
    static void f(Object o) {
        System.out
            .println(o);
    }
    private C12() {
    }
    private static C12 inst;
    public static synchronized C12 get() {
        if (inst == null) inst = new C12();
        return inst;
    }
}
