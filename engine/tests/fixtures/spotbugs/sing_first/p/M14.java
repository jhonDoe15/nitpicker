package p;
public class M14 implements java.io.Serializable {
 static final Object O = "x";
    private M14() {
    }
    private static M14 inst;
    public static synchronized M14 get() {
        if (inst == null) inst = new M14();
        return inst;
    }
}
