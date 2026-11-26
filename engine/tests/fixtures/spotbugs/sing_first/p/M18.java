package p;
public class M18 implements java.io.Serializable {
 static final int K0 = 5;
 static final int X = K0 << 2;
    private M18() {
    }
    private static M18 inst;
    public static synchronized M18 get() {
        if (inst == null) inst = new M18();
        return inst;
    }
}
