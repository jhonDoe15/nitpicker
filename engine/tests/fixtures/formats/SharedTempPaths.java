package shop;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SharedTempPaths {
    private static final String TMP = System.getProperty("java.io.tmpdir");
    private static final String SUITE = "parity";
    private static final AtomicInteger RUNS = new AtomicInteger();
    private static final Path SHARED = Path.of(TMP, "suite-report.json");

    @TempDir
    Path dir;

    @Test
    void fixedName() throws IOException {
        Path out = Path.of(System.getProperty("java.io.tmpdir"), "report.json");
        Files.writeString(out, "{}");
    }

    @Test
    void processOnly() throws IOException {
        File out = new File(TMP, "report-" + ProcessHandle.current().pid() + ".json");
        out.delete();
    }

    @Test
    void literalTmp() throws IOException {
        try (FileWriter writer = new FileWriter("/tmp/report.txt")) {
            writer.write("x");
        }
    }

    @Test
    void resolved() throws IOException {
        Files.createDirectories(Paths.get(TMP).resolve(SUITE));
    }

    @Test
    void concatenated() throws IOException {
        Files.write(Path.of(TMP + "/" + SUITE + ".bin"), new byte[0]);
    }

    @Test
    void sharedField() throws IOException {
        Files.deleteIfExists(SHARED);
    }

    @Test
    void helper() throws IOException {
        Files.writeString(reportFor("a"), "{}");
    }

    private Path reportFor(String name) {
        return Path.of(TMP, "engine-" + name + "-" + ProcessHandle.current().pid() + ".json");
    }

    @Test
    void process() throws Exception {
        new ProcessBuilder("engine", "--report", new File(TMP, "out.json").getPath()).start();
    }

    @Test
    void okUnique() throws IOException {
        Files.writeString(Path.of(TMP, "report-" + UUID.randomUUID() + ".json"), "{}");
        Files.writeString(Path.of(TMP, "report-" + RUNS.incrementAndGet() + ".json"), "{}");
        Files.writeString(dir.resolve("report.json"), "{}");
        Files.writeString(Files.createTempFile("report-", ".json"), "{}");
        Files.createTempDirectory(Path.of(TMP), "run-");
        Files.writeString(Files.createTempDirectory("r").resolve("x.json"), "{}");
    }

    @Test
    void okMissing() {
        File missing = new File(TMP, "no-such-file");
        org.junit.jupiter.api.Assertions.assertFalse(missing.exists());
        Path absent = Path.of("/tmp/absent");
        org.junit.jupiter.api.Assertions.assertFalse(Files.exists(absent));
    }

    @Test
    void okParameterOnly() throws IOException {
        Files.writeString(named("a"), "{}");
    }

    private Path named(String name) {
        return Path.of(TMP, name);
    }

    @Test
    void okDataNotPath() throws IOException {
        Files.writeString(dir.resolve("a"), "/tmp/x");
        Files.writeString(dir.resolve("b"), TMP + "/x");
        Files.copy(Path.of(TMP, "src.txt"), dir.resolve("c"));
    }

    @Test
    void wholePathInString() throws IOException {
        String whole = TMP + "/whole.json";
        Files.writeString(Path.of(whole), "x");
        Files.copy(dir.resolve("d"), Path.of(TMP, "copied.txt"));
    }
}
