package p;
public class M17 implements java.io.Serializable {
 static final String S = new String("a");
    private M17() {
    }
    private static M17 inst;
    public static synchronized M17 get() {
        if (inst == null) inst = new M17();
        return inst;
    }
}
