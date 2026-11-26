package p;

import lombok.SneakyThrows;

public class N2 {
    private final String name = check();

    @SneakyThrows
    public N2() {
        Thread.sleep(1);
    }

    @SneakyThrows
    public N2(int x) {
        if (x < 0) {
            throw new IllegalStateException();
        }
    }

    private static String check() throws IllegalStateException {
        return "x";
    }
}
