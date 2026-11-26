package p;
import java.io.Serializable;

public class Lm implements Serializable {
    private static final Lm INSTANCE =
        new Lm();
    private Lm() {}
    public static Lm getInstance() { return INSTANCE; }
}
