package p;

import lombok.NonNull;

public class N1 {
    private final String a;
    private final String b;

    public N1(
            String a,
            @NonNull String b) {
        this.a = a;
        this.b = b;
    }

    public N1(@NonNull String a) {
        this(a, "x");
    }
}
