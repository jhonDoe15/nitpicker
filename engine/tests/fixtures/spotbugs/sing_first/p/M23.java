package p;
public class M23 implements java.io.Serializable {
 static final String S = "a".length() > 0 ? "y" : "z";
    private M23() {
    }
    private static M23 inst;
    public static synchronized M23 get() {
        if (inst == null) inst = new M23();
        return inst;
    }
}
