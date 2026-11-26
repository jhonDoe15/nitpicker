package p;
public class M26 implements java.io.Serializable {
 static final int X = Other.K2;
    private M26() {
    }
    private static M26 inst;
    public static synchronized M26 get() {
        if (inst == null) inst = new M26();
        return inst;
    }
}
