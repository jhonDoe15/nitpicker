package p;
import java.io.Serializable;
public class O implements Serializable {
    static int counter = 5;
    static String name = "x";
    private static final O INSTANCE = new O();
    private O() {}
    public static O getInstance() { return INSTANCE; }
    private Object readResolve() { return INSTANCE; }
}
