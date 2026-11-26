package p;

import lombok.Builder;

public class N7 {
    private final String a;
    private final String other = check();

    @Builder
    public N7(String a) {
        this.a = a;
    }

    private static String check() throws IllegalStateException {
        return "x";
    }
}
