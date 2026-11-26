package p;
public class M6 implements java.io.Serializable {
 static final String S2 = Other.CONST;
    private M6() {
    }
    private static M6 inst;
    public static synchronized M6 get() {
        if (inst == null) inst = new M6();
        return inst;
    }
}
