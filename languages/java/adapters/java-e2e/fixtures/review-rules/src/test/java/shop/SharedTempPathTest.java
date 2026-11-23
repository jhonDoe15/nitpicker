package shop;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

abstract class SharedTempPathTest {
  private static final String TMP = System.getProperty("java.io.tmpdir");

  @TempDir Path dir;

  @Test
  void writesFixedTempPaths() throws IOException {
    Path report = Path.of(TMP, "report.json"); // violation: SharedTempPathInTest
    Files.writeString(report, "{}");
    File perProcess = new File(TMP, "run-" + ProcessHandle.current().pid()); // violation: SharedTempPathInTest
    Files.createDirectories(perProcess.toPath());
  }

  @Test
  void writesUniqueTempPaths() throws IOException {
    Files.writeString(dir.resolve("report.json"), "{}");
    Files.writeString(Path.of(TMP, "report-" + UUID.randomUUID() + ".json"), "{}");
    Files.writeString(Files.createTempFile("report-", ".json"), "{}");
  }
}
