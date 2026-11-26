package p;
public class M44 implements java.io.Serializable {
 static final int X = 1_000;
    private M44() {
    }
    private static M44 inst;
    public static synchronized M44 get() {
        if (inst == null) inst = new M44();
        return inst;
    }
}
