package p;
import lombok.experimental.UtilityClass;
@UtilityClass
public class S12 {
    private final Object INSTANCE = new Object();
    public Object get() { return INSTANCE; }
}
