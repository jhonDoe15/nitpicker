package shop.subprocess;

import java.io.File;
import java.util.List;
import java.util.stream.Collectors;

public final class LintRuns {
  private LintRuns() {}

  public static ProcessBuilder lint(List<File> folders) {
    List<String> sources = folders.stream().filter(File::isDirectory).map(File::getPath).toList();
    return new ProcessBuilder(
        "linter", "--dir", String.join(",", sources), "--format", "sarif"); // violation: UnguardedOptionList
  }

  public static ProcessBuilder lintStream(List<File> folders) {
    List<File> sources = folders.stream().filter(File::isDirectory).toList();
    return new ProcessBuilder(List.of(
        "linter",
        "--dir",
        sources.stream().map(File::getPath).collect(Collectors.joining(",")))); // violation: UnguardedOptionList
  }

  public static ProcessBuilder checked(List<File> folders) {
    List<String> sources = folders.stream().filter(File::isDirectory).map(File::getPath).toList();
    if (sources.isEmpty()) {
      throw new IllegalArgumentException("no sources");
    }
    return new ProcessBuilder("linter", "--dir", String.join(",", sources));
  }

  public static ProcessBuilder given(List<String> sources) {
    return new ProcessBuilder("linter", "--dir", String.join(",", sources));
  }
}
