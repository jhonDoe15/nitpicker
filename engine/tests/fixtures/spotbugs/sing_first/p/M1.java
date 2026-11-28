package p;
public class M1 implements java.io.Serializable {
 static final int T = 1 > 0 ? 1 : 2;
    private M1() {
    }
    private static M1 inst;
    public static synchronized M1 get() {
        if (inst == null) inst = new M1();
        return inst;
    }
}
