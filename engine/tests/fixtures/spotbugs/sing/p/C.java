package p;
import java.io.Serializable;
public class C implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final C INSTANCE = new C();
    private C() {}
    public static C getInstance() { return INSTANCE; }
}
