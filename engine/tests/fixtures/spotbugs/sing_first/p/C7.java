package p;
import java.io.Serializable;
public class C7 implements Serializable {
    interface Foo { default void d() {} }
    enum E { X; void q() {} }
    Runnable r = () -> {
        System.out.println();
    };
    private C7() {
    }
    private static C7 inst;
    public static synchronized C7 get() {
        if (inst == null) inst = new C7();
        return inst;
    }
}
