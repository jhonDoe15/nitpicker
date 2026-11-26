package p;
public class M29 implements java.io.Serializable {
 static final int X = M29.Y + 1;
 static final int Y = 2;
    private M29() {
    }
    private static M29 inst;
    public static synchronized M29 get() {
        if (inst == null) inst = new M29();
        return inst;
    }
}
