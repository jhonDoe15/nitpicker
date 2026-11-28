package p;
public class M7 implements java.io.Serializable {
 static final int Z = Other.K;
    private M7() {
    }
    private static M7 inst;
    public static synchronized M7 get() {
        if (inst == null) inst = new M7();
        return inst;
    }
}
