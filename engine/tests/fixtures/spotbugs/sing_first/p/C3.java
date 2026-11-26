package p;
import java.io.Serializable;
public class C3 implements Serializable {
    private C3() {
    }
    private static C3 inst;
    public static synchronized C3 get() {
        if (inst == null) inst = new C3();
        return inst;
    }
}
