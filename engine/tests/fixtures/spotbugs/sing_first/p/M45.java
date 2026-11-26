package p;
public class M45 implements java.io.Serializable {
 static final String S = """
        text
        """;
    private M45() {
    }
    private static M45 inst;
    public static synchronized M45 get() {
        if (inst == null) inst = new M45();
        return inst;
    }
}
