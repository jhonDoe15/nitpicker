package p;

import lombok.NoArgsConstructor;

@NoArgsConstructor
public class N4 {
    private String other = check();

    public N4(String x) {
        this.other = x;
    }

    private static String check() throws IllegalStateException {
        return "x";
    }
}
