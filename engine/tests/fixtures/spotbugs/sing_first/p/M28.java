package p;
public class M28 implements java.io.Serializable {
 static final int A, B2;
 static { A = 1; B2 = 2; }
    private M28() {
    }
    private static M28 inst;
    public static synchronized M28 get() {
        if (inst == null) inst = new M28();
        return inst;
    }
}
