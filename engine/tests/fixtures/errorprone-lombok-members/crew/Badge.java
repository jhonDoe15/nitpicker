package crew;

import lombok.ToString;

@ToString(onlyExplicitlyIncluded = true)
public class Badge {
    private final String code = "A";

    @ToString.Include
    private String shown() {
        return code.toLowerCase();
    }

    private String spare() {
        return code;
    }
}
