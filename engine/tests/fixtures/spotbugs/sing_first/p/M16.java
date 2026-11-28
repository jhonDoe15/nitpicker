package p;
public class M16 implements java.io.Serializable {
 static int K = 5;
    private M16() {
    }
    private static M16 inst;
    public static synchronized M16 get() {
        if (inst == null) inst = new M16();
        return inst;
    }
}
