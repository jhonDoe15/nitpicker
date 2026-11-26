package p;
public class M5 implements java.io.Serializable {
 static final char C = (char) ('a' + 1);
    private M5() {
    }
    private static M5 inst;
    public static synchronized M5 get() {
        if (inst == null) inst = new M5();
        return inst;
    }
}
