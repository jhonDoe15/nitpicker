package p;
import java.io.Serializable;
import java.util.function.Supplier;
public class B3 implements Serializable {
    public B3() {
        System.out.println(1);
    }
    Supplier<String> s = () -> "x";
    private static final B3 INSTANCE = new B3();
    public static B3 getInstance() { return INSTANCE; }
}
