package p;
public class M21 implements java.io.Serializable {
 static final int X = (int) 3.5;
    private M21() {
    }
    private static M21 inst;
    public static synchronized M21 get() {
        if (inst == null) inst = new M21();
        return inst;
    }
}
