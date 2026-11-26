package p;
import java.io.Serializable;
public class C8 implements Serializable {
    static void f(int a) {
        for (int i = 0;
             i < a; i++) { System.out.println(i); }
    }
    static void g() {
        if (inst == null)
            return;
    }
    static void h() { ; }
    static void h2() { }
    static void h3() {
    }
    static abstract class X { abstract void y(); }
    private C8() {
    }
    private static C8 inst;
    public static synchronized C8 get() {
        if (inst == null) inst = new C8();
        return inst;
    }
}
