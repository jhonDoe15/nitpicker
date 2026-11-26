package p;
import java.io.Serializable;
public class C5 implements Serializable {
    private C5() {
        this(1);
    }
    private C5(int a) {
        super();
    }
    static class Inner {
        void z() {}
    }
    private static C5 inst;
    public static synchronized C5 get() {
        if (inst == null) inst = new C5();
        return inst;
    }
}
