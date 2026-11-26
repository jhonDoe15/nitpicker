package p;
import java.io.Serializable;
public class C14 implements Serializable {
    static int f(int a) {
        return
          a
          + 1;
    }
    static void thr() {
        throw
          new RuntimeException();
    }
    private C14() {
    }
    private static C14 inst;
    public static synchronized C14 get() {
        if (inst == null) inst = new C14();
        return inst;
    }
}
