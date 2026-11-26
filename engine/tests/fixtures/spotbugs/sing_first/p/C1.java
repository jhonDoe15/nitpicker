package p;
import java.io.Serializable;
public class C1 implements Serializable {

    int x = 5;
    private C1() {
    }
    private static C1 inst;
    public static synchronized C1 get() {
        if (inst == null) inst = new C1();
        return inst;
    }
}
