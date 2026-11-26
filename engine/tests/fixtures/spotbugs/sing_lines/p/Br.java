package p;
import java.io.Serializable;
import java.util.function.Supplier;

@SuppressWarnings("serial")
public class Br
    implements Supplier<String>, Serializable
{
    private static final Br INSTANCE = new Br();
    private Br() {}
    public static Br getInstance() { return INSTANCE; }
    @Override
    public String get() { return "x"; }
}
