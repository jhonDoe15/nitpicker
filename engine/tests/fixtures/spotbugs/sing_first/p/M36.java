package p;
public class M36 implements java.io.Serializable {
 static final String S = ("a");
    private M36() {
    }
    private static M36 inst;
    public static synchronized M36 get() {
        if (inst == null) inst = new M36();
        return inst;
    }
}
