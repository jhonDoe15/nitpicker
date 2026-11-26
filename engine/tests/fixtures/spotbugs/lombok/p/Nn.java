package p;

import lombok.NonNull;

public class Nn {
    private final String name;

    public Nn(@NonNull String name) {
        this.name = name;
    }

    public String name() {
        return name;
    }
}
