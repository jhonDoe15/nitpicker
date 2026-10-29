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
  private static final String SPRING_CONTEXT = "org.springframework.context.ApplicationContext";

  private ArchRules() {}

  public static void main(String[] args) throws IOException {
    if (args.length < 3 || args.length > 4) {
      System.err.println(
          "usage: ArchRules <output.json> <main-class-dirs> <unit-test-class-dirs> [<other-test-class-dirs>]");
      System.exit(2);
    }
    JavaClasses main = importDirectories(args[1]);
    JavaClasses unitTests = importDirectories(args[2]);
    JavaClasses otherTests = importDirectories(args.length == 4 ? args[3] : "");
    Set<Found> found = Found.newSet();
    String root = usesSpring() ? Layout.rootPackage(main) : null;
    if (root != null) {
      Layout.check(main, root, found);
    }
    Roles roles = Roles.load();
    if (usesSpring()) {
      Layers.check(main, roles, found);
      Lifetimes.check(main, found);
      TestRules.check(unitTests, otherTests, found);
    }
    Aggregates.check(main, found);
    Contracts.check(main, root, roles, found);
    String json =
        "{\"root\":" + (root == null ? "null" : "\"" + root + "\"") + ",\"violations\":["
            + found.stream().map(Found::toJson).collect(Collectors.joining(",")) + "]}\n";
    Files.writeString(Paths.get(args[0]), json, StandardCharsets.UTF_8);
  }

  private static boolean usesSpring() {
    try {
      Class.forName(SPRING_CONTEXT, false, ArchRules.class.getClassLoader());
      return true;
    } catch (ClassNotFoundException absent) {
      return false;
    }
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
