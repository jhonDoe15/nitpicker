package p;
public class M2 implements java.io.Serializable {
 static final String S = "a" + 'c' + 1 + 2.0 + true;
    private M2() {
    }
    private static M2 inst;
    public static synchronized M2 get() {
        if (inst == null) inst = new M2();
        return inst;
    }
}
