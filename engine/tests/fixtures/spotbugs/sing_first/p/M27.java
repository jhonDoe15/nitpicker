package p;
public class M27 implements java.io.Serializable {
 private static final String S = "a" + p.Other.CONST;
    private M27() {
    }
    private static M27 inst;
    public static synchronized M27 get() {
        if (inst == null) inst = new M27();
        return inst;
    }
}
