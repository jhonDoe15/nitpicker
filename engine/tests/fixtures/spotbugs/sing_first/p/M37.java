package p;
public class M37 implements java.io.Serializable {
 static final int X = +1;
    private M37() {
    }
    private static M37 inst;
    public static synchronized M37 get() {
        if (inst == null) inst = new M37();
        return inst;
    }
}
