package p;

import lombok.Data;

@Data
public class N5 {
    private String other = check();

    private static String check() throws IllegalStateException {
        return "x";
    }
}
