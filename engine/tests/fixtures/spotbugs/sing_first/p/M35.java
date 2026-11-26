package p;
public class M35 implements java.io.Serializable {
 static final int X = (Other.K);
    private M35() {
    }
    private static M35 inst;
    public static synchronized M35 get() {
        if (inst == null) inst = new M35();
        return inst;
    }
}
