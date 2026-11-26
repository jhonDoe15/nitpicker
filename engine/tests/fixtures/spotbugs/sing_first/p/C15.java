package p;
import java.io.Serializable;
public class C15 implements Serializable {
    static void f() {
        int x =
           Integer
            .parseInt("1");
        assert x > 0;
    }
    private C15() {
    }
    private static C15 inst;
    public static synchronized C15 get() {
        if (inst == null) inst = new C15();
        return inst;
    }
}
