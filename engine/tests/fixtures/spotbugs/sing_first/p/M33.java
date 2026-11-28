package p;
public class M33 implements java.io.Serializable {
 static final int X = 'a' + 1;
    private M33() {
    }
    private static M33 inst;
    public static synchronized M33 get() {
        if (inst == null) inst = new M33();
        return inst;
    }
}
