package p;
public class M32 implements java.io.Serializable {
 final String X = "s";
    private M32() {
    }
    private static M32 inst;
    public static synchronized M32 get() {
        if (inst == null) inst = new M32();
        return inst;
    }
}
