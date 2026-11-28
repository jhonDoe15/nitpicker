package p;
public class M40 implements java.io.Serializable {
 static final String S = java.io.File.separator;
    private M40() {
    }
    private static M40 inst;
    public static synchronized M40 get() {
        if (inst == null) inst = new M40();
        return inst;
    }
}
