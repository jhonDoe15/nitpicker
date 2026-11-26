package p;
public class M9 implements java.io.Serializable {
 static final int K0 = 3;
 static final int V = -K0;
    private M9() {
    }
    private static M9 inst;
    public static synchronized M9 get() {
        if (inst == null) inst = new M9();
        return inst;
    }
}
