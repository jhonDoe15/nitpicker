package p;
public class M13 implements java.io.Serializable {
 static final byte B = 1;
 static final short SH = 2;
 static final long LL = 3L;
 static final float FL = 1f;
    private M13() {
    }
    private static M13 inst;
    public static synchronized M13 get() {
        if (inst == null) inst = new M13();
        return inst;
    }
}
