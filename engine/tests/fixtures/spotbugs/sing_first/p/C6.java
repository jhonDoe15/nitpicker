package p;
import java.io.Serializable;
public class C6 implements Serializable {
    public C6() {
    }
    private static C6 inst;
    public static synchronized C6 get() {
        if (inst == null) inst = new C6();
        return inst;
    }
}
