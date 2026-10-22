import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

public final class MetricsSupport {
  private MetricsSupport() {}

  public static List<Path> sourceFiles(Path projectDir, String[] args, int firstRoot, String extension)
      throws IOException {
    List<Path> files = new ArrayList<>();
    for (int i = firstRoot; i < args.length; i++) {
      Path root = projectDir.resolve(args[i]);
      if (Files.isDirectory(root)) {
        try (Stream<Path> walk = Files.walk(root)) {
          walk.filter(p -> p.toString().endsWith(extension)).sorted().forEach(files::add);
        }
      }
    }
    return files;
  }

  public static String relative(Path projectDir, Path file) {
    return projectDir.relativize(file.toAbsolutePath().normalize()).toString().replace('\\', '/');
  }

  public static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (c < 0x20) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
  }
}
