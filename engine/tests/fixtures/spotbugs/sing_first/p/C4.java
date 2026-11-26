package p;
import java.io.Serializable;
public class C4 implements Serializable {
    static {
        System.out.println(
            "x");
    }
    private C4() {
    }
    private static C4 inst;
    public static synchronized C4 get() {
        if (inst == null) inst = new C4();
        return inst;
    }
}
