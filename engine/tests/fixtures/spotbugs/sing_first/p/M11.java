package p;
public class M11 implements java.io.Serializable {
 static final int U = Other.NON;
    private M11() {
    }
    private static M11 inst;
    public static synchronized M11 get() {
        if (inst == null) inst = new M11();
        return inst;
    }
}
