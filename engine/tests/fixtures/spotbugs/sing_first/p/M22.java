package p;
public class M22 implements java.io.Serializable {
 static final int X = Integer.MIN_VALUE + 1;
    private M22() {
    }
    private static M22 inst;
    public static synchronized M22 get() {
        if (inst == null) inst = new M22();
        return inst;
    }
}
