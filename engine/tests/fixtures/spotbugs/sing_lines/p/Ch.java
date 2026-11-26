package p;
import java.io.Serializable;

public class Ch implements Serializable {
    private static final Ch INSTANCE = new Ch();
    private Ch() {}
    public static Ch getInstance() {
        return INSTANCE
            .self()
            .self();
    }
    Ch self() { return this; }
}
