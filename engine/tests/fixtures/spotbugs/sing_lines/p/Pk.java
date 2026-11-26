package p;
import java.io.Serializable;

public class Pk implements Serializable {
    static final Pk INSTANCE = new Pk();
    private Pk() {}
    public static Pk getInstance() { return INSTANCE; }
}
