package p;
public class M25 implements java.io.Serializable {
 static final String S = "" + Long.MAX_VALUE;
    private M25() {
    }
    private static M25 inst;
    public static synchronized M25 get() {
        if (inst == null) inst = new M25();
        return inst;
    }
}
