package p;
public class M39 implements java.io.Serializable {
 static final int X = true ? 1 : Other.NON;
    private M39() {
    }
    private static M39 inst;
    public static synchronized M39 get() {
        if (inst == null) inst = new M39();
        return inst;
    }
}
