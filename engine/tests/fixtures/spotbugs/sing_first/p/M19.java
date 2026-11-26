package p;
public class M19 implements java.io.Serializable {
 static final boolean B = Other.K > 2;
    private M19() {
    }
    private static M19 inst;
    public static synchronized M19 get() {
        if (inst == null) inst = new M19();
        return inst;
    }
}
