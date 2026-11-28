package p;
import java.io.Serializable;
public class T implements Serializable {
    private static T instance;
    private T() {}
    public static synchronized T get() {
        if (instance == null) {
            instance = new T();
        }
        return instance;
    }
}
