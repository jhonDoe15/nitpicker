import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public final class ArchRules {
  private ArchRules() {}

  public static void main(String[] args) throws IOException {
    if (args.length != 3) {
      System.err.println("usage: ArchRules <output.json> <main-class-dirs> <test-class-dirs>");
      System.exit(2);
    }
    JavaClasses main = importDirectories(args[1]);
    JavaClasses test = importDirectories(args[2]);
    Set<Found> found = Found.newSet();
    String root = Layout.rootPackage(main);
    if (root != null) {
      Layout.check(main, root, found);
    }
    Layers.check(main, found);
    TestRules.check(test, found);
    String json =
        "{\"root\":" + (root == null ? "null" : "\"" + root + "\"") + ",\"violations\":["
            + found.stream().map(Found::toJson).collect(Collectors.joining(",")) + "]}\n";
    Files.writeString(Paths.get(args[0]), json, StandardCharsets.UTF_8);
  }

  private static JavaClasses importDirectories(String joined) {
    List<Path> directories = new ArrayList<>();
    for (String entry : joined.split(java.io.File.pathSeparator)) {
      if (!entry.isEmpty() && Files.isDirectory(Paths.get(entry))) {
        directories.add(Paths.get(entry));
      }
    }
    return new ClassFileImporter().importPaths(directories);
  }
}
