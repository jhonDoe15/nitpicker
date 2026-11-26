package p;
public class M12 implements java.io.Serializable {
 static final String N = null;
    private M12() {
    }
    private static M12 inst;
    public static synchronized M12 get() {
        if (inst == null) inst = new M12();
        return inst;
    }
}
