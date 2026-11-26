package p;
public class M31 implements java.io.Serializable {
 final int X = 5;
    private M31() {
    }
    private static M31 inst;
    public static synchronized M31 get() {
        if (inst == null) inst = new M31();
        return inst;
    }
}
