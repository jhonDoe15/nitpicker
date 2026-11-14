package nitpicker.effects.graphql;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class Schema {
  private static final Pattern COMMENT = Pattern.compile("#[^\\n]*");
  private static final Pattern LIST = Pattern.compile("\\[\\s*([A-Za-z_]\\w*)\\s*!?\\s*]");
  private static final Pattern NODE = Pattern.compile("\\bnode\\s*:\\s*([A-Za-z_]\\w*)");
  private static final Pattern BLOCK = Pattern.compile("\\b(?:type|interface)\\s+(\\w+)[^{]*\\{([^}]*)}");
  private static final Pattern FIELD = Pattern.compile("(?:\\([^)]*\\))?\\s*:\\s*\\[?\\s*([A-Za-z_]\\w*)");
  private static final int DEPTH = 8;

  private Schema() {}

  public static Set<String> listTypes(List<String> directories) {
    Set<String> found = new HashSet<>();
    boolean read = false;
    for (String directory : directories) {
      Path root = Path.of(directory);
      if (!Files.isDirectory(root)) {
        continue;
      }
      try (Stream<Path> files = Files.walk(root, DEPTH)) {
        for (Path file : files.filter(Schema::isSchema).toList()) {
          read = true;
          collect(Files.readString(file, StandardCharsets.UTF_8), found);
        }
      } catch (IOException | RuntimeException unreadable) {
        System.err.println("Effects skipped schema under " + directory + ": " + unreadable);
      }
    }
    return read ? found : null;
  }

  private static boolean isSchema(Path file) {
    String name = file.getFileName().toString();
    return Files.isRegularFile(file) && (name.endsWith(".graphqls") || name.endsWith(".graphql")
        || name.endsWith(".gqls"));
  }

  private static void collect(String text, Set<String> found) {
    String plain = COMMENT.matcher(text).replaceAll("");
    for (Pattern pattern : List.of(LIST, NODE)) {
      Matcher matcher = pattern.matcher(plain);
      while (matcher.find()) {
        found.add(matcher.group(1));
      }
    }
    Map<String, Set<String>> fields = new HashMap<>();
    Matcher block = BLOCK.matcher(plain);
    while (block.find()) {
      Set<String> types = fields.computeIfAbsent(block.group(1), name -> new HashSet<>());
      Matcher field = FIELD.matcher(block.group(2));
      while (field.find()) {
        types.add(field.group(1));
      }
    }
    Deque<String> pending = new ArrayDeque<>(found);
    while (!pending.isEmpty()) {
      for (String type : fields.getOrDefault(pending.poll(), Set.of())) {
        if (found.add(type)) {
          pending.add(type);
        }
      }
    }
  }
}
