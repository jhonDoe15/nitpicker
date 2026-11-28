package p;
public class M42 implements java.io.Serializable {
 static final Other.E EN = Other.E.A;
    private M42() {
    }
    private static M42 inst;
    public static synchronized M42 get() {
        if (inst == null) inst = new M42();
        return inst;
    }
}
