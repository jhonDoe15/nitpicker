package p;
public class M15 implements java.io.Serializable {
 static final CharSequence CS = "x";
    private M15() {
    }
    private static M15 inst;
    public static synchronized M15 get() {
        if (inst == null) inst = new M15();
        return inst;
    }
}
