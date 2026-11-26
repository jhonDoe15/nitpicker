package p;
public class M20 implements java.io.Serializable {
 static final int X = Other.K + 1;
    private M20() {
    }
    private static M20 inst;
    public static synchronized M20 get() {
        if (inst == null) inst = new M20();
        return inst;
    }
}
