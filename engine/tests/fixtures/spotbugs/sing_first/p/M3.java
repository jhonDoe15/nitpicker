package p;
public class M3 implements java.io.Serializable {
 static final int Q = ~5;
    private M3() {
    }
    private static M3 inst;
    public static synchronized M3 get() {
        if (inst == null) inst = new M3();
        return inst;
    }
}
