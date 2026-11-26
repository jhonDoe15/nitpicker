package p;

import lombok.NonNull;

public class N9 {
    private final String a;
    private final String b;

    public N9(String a, String b) {
        this.a = a;
        this.b = b;
    }

    public N9(
            @NonNull String a) {
        this(a,
                "x");
        System.out.println(a);
    }

    public N9(int x,
            @NonNull String a) {
        super();
        this.a = a;
        this.b = a;
    }
}
