package p;
public class M34 implements java.io.Serializable {
 static final char C = 'a';
 static final String S = "" + C;
    private M34() {
    }
    private static M34 inst;
    public static synchronized M34 get() {
        if (inst == null) inst = new M34();
        return inst;
    }
}
