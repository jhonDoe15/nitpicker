package p;
import java.io.Serializable;
public class C2 implements Serializable {
    static final int K = 3;
    static final String S = "a" + "b";
    static final Integer BOX = 4;
    void m() {
    }
    private C2() {
    }
    private static C2 inst;
    public static synchronized C2 get() {
        if (inst == null) inst = new C2();
        return inst;
    }
}
