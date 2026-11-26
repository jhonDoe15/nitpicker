package p;
import java.io.Serializable;
public class M implements Serializable {
    private static final M INSTANCE = new M();
    public M() {}
    public static M getInstance() { return INSTANCE; }
}
