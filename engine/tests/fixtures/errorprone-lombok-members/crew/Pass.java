package crew;

import lombok.AllArgsConstructor;
import lombok.Builder;

@Builder
@AllArgsConstructor
public class Pass {
    private final String name;
    private final int level;

    private Pass(int level) {
        this("guest", level);
    }

    private static <T extends CharSequence> int size(T text) {
        return text.length();
    }

    public int width() {
        return size(name) + level;
    }
}
