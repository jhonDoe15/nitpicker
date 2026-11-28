package p;
public class M10 implements java.io.Serializable {
 static final double D = 1.0 / 3;
    private M10() {
    }
    private static M10 inst;
    public static synchronized M10 get() {
        if (inst == null) inst = new M10();
        return inst;
    }
}
