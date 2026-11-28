package p;

import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Synchronized;

public class Lz {
    @Getter(lazy = true)
    private final List<String> cached = compute();

    private static List<String> compute() {
        return new ArrayList<>();
    }

    @Synchronized
    public void touch() {
        System.out.println("x");
    }
}
