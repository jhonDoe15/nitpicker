package p;
public class M43 implements java.io.Serializable {
 static final int X = Other.Inner.Z;
    private M43() {
    }
    private static M43 inst;
    public static synchronized M43 get() {
        if (inst == null) inst = new M43();
        return inst;
    }
}
