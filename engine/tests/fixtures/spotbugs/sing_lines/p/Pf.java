package p;
import java.io.Serializable;

public class Pf implements Serializable {
    protected static final Pf INSTANCE = new Pf();
    private Pf() {}
    public static Pf getInstance() { return INSTANCE; }
}
