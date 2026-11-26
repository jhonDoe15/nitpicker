package p;
public class M8 implements java.io.Serializable {
 static final String S0 = "x";
 static final String S3 = S0 + "y";
    private M8() {
    }
    private static M8 inst;
    public static synchronized M8 get() {
        if (inst == null) inst = new M8();
        return inst;
    }
}
