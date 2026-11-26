package p;

import java.util.List;
import lombok.Builder;

@Builder
public class Bd {
    private final List<String> items;
    private final String name;
}
