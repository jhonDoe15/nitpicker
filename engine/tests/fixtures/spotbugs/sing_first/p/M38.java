package p;
public class M38 implements java.io.Serializable {
 static final boolean B = !Other.F;
    private M38() {
    }
    private static M38 inst;
    public static synchronized M38 get() {
        if (inst == null) inst = new M38();
        return inst;
    }
}
