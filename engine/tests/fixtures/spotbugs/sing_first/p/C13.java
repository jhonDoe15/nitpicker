package p;
import java.io.Serializable;
public class C13 implements Serializable {
    static int[] arr;
    static void f(int a) {
        arr
          [0]
            = a;
    }
    private C13() {
    }
    private static C13 inst;
    public static synchronized C13 get() {
        if (inst == null) inst = new C13();
        return inst;
    }
}
