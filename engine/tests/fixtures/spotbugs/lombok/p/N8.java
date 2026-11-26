package p;

import lombok.Value;
import lombok.experimental.NonFinal;

@Value
@NonFinal
public class N8 {
    String a;
    String other = check();

    private static String check() throws IllegalStateException {
        return "x";
    }
}
