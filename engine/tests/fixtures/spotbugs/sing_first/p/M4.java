package p;
public class M4 implements java.io.Serializable {
 static final int R = (5 & 3) | (2 ^ 1);
    private M4() {
    }
    private static M4 inst;
    public static synchronized M4 get() {
        if (inst == null) inst = new M4();
        return inst;
    }
}
