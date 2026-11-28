package p;
public class M41 implements java.io.Serializable {
 static final int X = Short.MAX_VALUE;
    private M41() {
    }
    private static M41 inst;
    public static synchronized M41 get() {
        if (inst == null) inst = new M41();
        return inst;
    }
}
