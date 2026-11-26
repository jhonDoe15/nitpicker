package p;

import lombok.AllArgsConstructor;

@AllArgsConstructor
public class N3 {
    private final String name;
    private final String other = check();

    private static String check() throws IllegalStateException {
        return "x";
    }
}
