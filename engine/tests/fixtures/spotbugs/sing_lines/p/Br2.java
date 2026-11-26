package p;
import java.io.Serializable;
import java.util.function.Supplier;

public final class Br2 implements Supplier<String>, Serializable {
    private static final Br2 INSTANCE = new Br2();
    private Br2() {}
    public static Br2 getInstance() { return INSTANCE; }
    public String get() { return "x"; }
}
