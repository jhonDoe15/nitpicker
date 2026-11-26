package p;

import lombok.SneakyThrows;

public class St {
    private final String text;

    @SneakyThrows
    public St(String path) {
        this.text = java.nio.file.Files.readString(java.nio.file.Path.of(path));
    }

    public String text() {
        return text;
    }
}
