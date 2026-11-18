import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Writes the class files of hand-written sources, one absolute path per line, for SpotBugs' -analyzeFromFile.
 * Arguments: the list file, then {@code --classes <dir>}, {@code --generated <dir>} and {@code --written <dir>},
 * each repeated as needed. A class is generated when its source declares it (or the type it is nested in, or the
 * Kotlin file facade) in a generated root and no source of a written root declares it.
 */
public final class GeneratedClasses {
  private static final Pattern PACKAGE = Pattern.compile("^\\s*package\\s+([\\w.]+)", Pattern.MULTILINE);
  private static final Pattern TYPE = Pattern.compile(
      "^(?:(?:public|private|protected|internal|abstract|final|sealed|non-sealed|open|data|enum|annotation|inner"
          + "|value|static|strictfp|fun)\\s+)*(?:class|interface|enum|record|object|@interface)\\s+"
          + "([\\p{L}_$][\\p{L}\\p{N}_$]*)", Pattern.MULTILINE);

  private GeneratedClasses() {}

  public static void main(String[] args) throws IOException {
    List<Path> classes = new ArrayList<>();
    List<Path> generated = new ArrayList<>();
    List<Path> written = new ArrayList<>();
    for (int index = 1; index + 1 < args.length; index += 2) {
      Path value = Path.of(args[index + 1]);
      if (args[index].equals("--classes")) {
        classes.add(value);
      } else if (args[index].equals("--generated")) {
        generated.add(value);
      } else if (args[index].equals("--written")) {
        written.add(value);
      } else {
        throw new IllegalArgumentException("Unknown argument " + args[index]);
      }
    }
    Set<String> generatedTypes = declaredTypes(generated);
    Set<String> writtenTypes = declaredTypes(written);
    List<String> kept = new ArrayList<>();
    for (Path directory : classes) {
      if (!Files.isDirectory(directory)) {
        continue;
      }
      try (Stream<Path> walk = Files.walk(directory)) {
        List<Path> files = walk.filter(path -> path.toString().endsWith(".class")).sorted()
            .collect(Collectors.toList());
        for (Path file : files) {
          String stem = directory.relativize(file).toString().replace(java.io.File.separatorChar, '/');
          if (!isGenerated(generatedTypes, writtenTypes, stem.substring(0, stem.length() - ".class".length()))) {
            kept.add(file.toAbsolutePath().toString());
          }
        }
      }
    }
    Files.write(Path.of(args[0]), kept, StandardCharsets.UTF_8);
  }

  static boolean isGenerated(Set<String> generated, Set<String> written, String stem) {
    if (written.contains(stem)) {
      return false;
    }
    for (int cut = stem.length(); cut > 0; cut = stem.lastIndexOf('$', cut - 1)) {
      if (generated.contains(stem.substring(0, cut))) {
        return true;
      }
    }
    return false;
  }

  static Set<String> declaredTypes(List<Path> roots) throws IOException {
    Set<String> types = new HashSet<>();
    for (Path root : roots) {
      if (!Files.isDirectory(root)) {
        continue;
      }
      List<Path> sources;
      try (Stream<Path> walk = Files.walk(root)) {
        sources = walk.filter(file -> file.toString().endsWith(".java") || file.toString().endsWith(".kt"))
            .collect(Collectors.toList());
      }
      for (Path source : sources) {
        String text = Files.readString(source, StandardCharsets.UTF_8);
        Matcher declared = PACKAGE.matcher(text);
        String prefix = declared.find() ? declared.group(1).replace('.', '/') + "/" : "";
        String name = source.getFileName().toString();
        String base = name.substring(0, name.lastIndexOf('.'));
        types.add(prefix + base);
        if (name.endsWith(".kt")) {
          types.add(prefix + base + "Kt");
        }
        Matcher type = TYPE.matcher(text);
        while (type.find()) {
          types.add(prefix + type.group(1));
        }
      }
    }
    return types;
  }
}
