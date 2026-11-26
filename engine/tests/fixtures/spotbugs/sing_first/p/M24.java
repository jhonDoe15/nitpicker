package p;
public class M24 implements java.io.Serializable {
 static final long X = 1L << 40;
    private M24() {
    }
    private static M24 inst;
    public static synchronized M24 get() {
        if (inst == null) inst = new M24();
        return inst;
    }
}
