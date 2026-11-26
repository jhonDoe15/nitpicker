package p;

import java.util.Date;

public class X22 {
    private final Object f;

    public X22() {
        f = new Date();
    }

    public Object g() {
        return f;
    }
}
