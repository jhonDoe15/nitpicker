package p;

import java.util.ArrayList;
import java.util.List;
import lombok.Builder;

@Builder
public class Bf {
    @Builder.Default
    private final List<String> items = new ArrayList<>();
    private final String name = check();

    private static String check() throws IllegalStateException {
        return "x";
    }
}
