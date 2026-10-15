import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Compiles source sets with javac and Error Prone as its plugin, and writes the Error Prone
 * diagnostics as a JSON array of {file, line, column, kind, message}. The Gradle and the Maven
 * builds both run it, so both get the same checks.
 *
 * <p>Usage: {@code ErrorProneReport <report.json> <checks.json> <main class directories>
 * <arguments file>...}. The class directories (joined with the path separator) give the
 * project's own top-level packages, which CheckReturnValue and NullAway cover. Each arguments file
 * holds one javac argument per line, then a line {@code --sources} and one source file per line.
 * Three kinds of line before {@code --sources} are not javac arguments: {@code --test-only} marks
 * test sources, {@code --target-release=<n>} is the release the build compiles for (used when this
 * JDK is newer and the build passes no module or preview options), and {@code --project-arg=<arg>}
 * is one of the build's own compiler arguments (only the preview and module options are kept). A compilation that fails (a compiler error,
 * not an Error Prone finding: those are warnings) ends the program with exit status 1 and the
 * errors on standard error, so it is never read as a clean report.
 */
public final class ErrorProneReport {
  private static final String SOURCES = "--sources";
  private static final String TEST_ONLY = "--test-only";
  private static final String NULLAWAY = "[NullAway] ";
  private static final String TARGET_RELEASE = "--target-release=";
  private static final String PROJECT_ARG = "--project-arg=";
  private static final List<String> MODULE_OPTIONS =
      List.of("--add-exports", "--add-modules", "--add-reads");
  private static final Pattern NAME = Pattern.compile("\"([^\"]+)\"");
  private static final Pattern ANNOTATION = Pattern.compile("@\\s*((?:\\w+\\s*\\.\\s*)*)(\\w+)");
  private static final Pattern LOMBOK_IMPORT =
      Pattern.compile("(?m)^\\s*import\\s+lombok\\s*\\.(?:\\s*\\w+\\s*\\.)*\\s*(\\w+|\\*)\\s*;");

  private ErrorProneReport() {}

  public static void main(String[] args) throws IOException {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    String checks = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
    List<String> packages = ownPackages(args[2]);
    List<String> entries = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    for (int index = 3; index < args.length; index++) {
      compile(compiler, Path.of(args[index]), checks, packages, entries, errors);
    }
    if (!errors.isEmpty()) {
      System.err.println(String.join("\n", errors));
      System.exit(1);
    }
    Files.writeString(
        Path.of(args[0]), "[" + String.join(",\n", entries) + "]\n", StandardCharsets.UTF_8);
  }

  /** Every package holding a main class, without the ones nested in another such package. */
  static List<String> ownPackages(String classDirectories) throws IOException {
    List<String> packages = new ArrayList<>();
    for (String directory : classDirectories.split(java.io.File.pathSeparator)) {
      Path root = Path.of(directory);
      if (directory.isEmpty() || !Files.isDirectory(root)) {
        continue;
      }
      try (Stream<Path> files = Files.walk(root)) {
        files
            .filter(file -> file.toString().endsWith(".class"))
            .map(file -> root.relativize(file.getParent() == null ? root : file.getParent()))
            .map(relative -> relative.toString().replace(java.io.File.separatorChar, '.'))
            .filter(name -> !name.isEmpty())
            .forEach(packages::add);
      }
    }
    List<String> sorted = packages.stream().distinct().sorted().toList();
    return sorted.stream()
        .filter(name -> sorted.stream().noneMatch(other -> name.startsWith(other + ".")))
        .toList();
  }

  static List<String> namesIn(String checks, String key) {
    Matcher list = Pattern.compile("\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(checks);
    List<String> names = new ArrayList<>();
    if (list.find()) {
      Matcher name = NAME.matcher(list.group(1));
      while (name.find()) {
        names.add(name.group(1));
      }
    }
    return names;
  }

  static String pluginArgument(String checks, List<String> packages, boolean test) {
    List<String> flags = new ArrayList<>();
    flags.add("-Xplugin:ErrorProne");
    flags.add("-XepAllErrorsAsWarnings");
    if (test) {
      flags.add("-XepCompilingTestOnlyCode");
    }
    namesIn(checks, "enable").forEach(check -> flags.add("-Xep:" + check + ":WARN"));
    namesIn(checks, "disable").forEach(check -> flags.add("-Xep:" + check + ":OFF"));
    if (packages.isEmpty()) {
      flags.add("-Xep:NullAway:OFF");
    } else {
      String joined = String.join(",", packages);
      flags.add("-XepOpt:CheckReturnValue:Packages=" + joined);
      flags.add("-Xep:NullAway:WARN");
      flags.add("-XepOpt:NullAway:AnnotatedPackages=" + joined);
    }
    return String.join(" ", flags);
  }

  static List<String> javacOptions(List<String> lines) {
    List<String> options = new ArrayList<>();
    List<String> projectArgs = new ArrayList<>();
    String release = null;
    for (String line : lines) {
      if (line.startsWith(PROJECT_ARG)) {
        projectArgs.add(line.substring(PROJECT_ARG.length()));
      } else if (line.startsWith(TARGET_RELEASE)) {
        release = line.substring(TARGET_RELEASE.length());
      } else if (!line.equals(TEST_ONLY)) {
        options.add(line);
      }
    }
    List<String> passed = passedOptions(projectArgs);
    options.addAll(passed);
    int target = release == null ? 0 : feature(release);
    if (passed.isEmpty() && target >= 8 && target < Runtime.version().feature()) {
      options.add("--release");
      options.add(String.valueOf(target));
    }
    return options;
  }

  private static int feature(String release) {
    String number = release.startsWith("1.") ? release.substring(2) : release;
    return number.matches("\\d+") ? Integer.parseInt(number) : 0;
  }

  private static List<String> passedOptions(List<String> args) {
    List<String> passed = new ArrayList<>();
    for (int index = 0; index < args.size(); index++) {
      String argument = args.get(index);
      if (argument.equals("--enable-preview")
          || MODULE_OPTIONS.stream().anyMatch(option -> argument.startsWith(option + "="))) {
        passed.add(argument);
      } else if (MODULE_OPTIONS.contains(argument) && index + 1 < args.size()) {
        passed.add(argument);
        passed.add(args.get(++index));
      }
    }
    return passed;
  }

  private static void compile(
      JavaCompiler compiler,
      Path argumentsFile,
      String checks,
      List<String> packages,
      List<String> entries,
      List<String> errors)
      throws IOException {
    List<String> lines = Files.readAllLines(argumentsFile, StandardCharsets.UTF_8);
    int separator = lines.indexOf(SOURCES);
    List<String> options = javacOptions(lines.subList(0, separator));
    options.add(pluginArgument(checks, packages, lines.subList(0, separator).contains(TEST_ONLY)));
    List<String> sources = lines.subList(separator + 1, lines.size());
    if (sources.isEmpty()) {
      return;
    }
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    boolean compiled;
    try (StandardJavaFileManager files =
        compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
      compiled =
          compiler
              .getTask(
                  null, files, diagnostics, options, null, files.getJavaFileObjectsFromStrings(sources))
              .call();
    }
    Map<JavaFileObject, String> texts = new HashMap<>();
    for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
      String code = diagnostic.getCode() == null ? "" : diagnostic.getCode();
      if (code.endsWith(".error.prone") && diagnostic.getSource() != null) {
        String text = texts.computeIfAbsent(diagnostic.getSource(), ErrorProneReport::read);
        if (diagnostic.getMessage(Locale.ROOT).startsWith(NULLAWAY)
            || !atLombokAnnotation(text, diagnostic.getStartPosition())) {
          entries.add(entry(diagnostic));
        }
      } else if (diagnostic.getKind() == Diagnostic.Kind.ERROR) {
        errors.add(location(diagnostic) + diagnostic.getMessage(Locale.ROOT));
      }
    }
    if (!compiled && errors.isEmpty()) {
      errors.add("javac failed on " + argumentsFile + " without reporting an error");
    }
  }

  private static String read(JavaFileObject source) {
    try {
      return source.getCharContent(true).toString();
    } catch (IOException e) {
      return "";
    }
  }

  /**
   * Lombok gives the members it generates the position of the annotation that asked for them, so a
   * diagnostic that starts at a Lombok annotation is about code nobody wrote: it is dropped. NullAway
   * findings are kept: there they are about the project's own fields (a generated constructor that
   * leaves a non-null field unset, which NullAway also reports without Lombok).
   */
  static boolean atLombokAnnotation(String text, long position) {
    if (position < 0 || position >= text.length()) {
      return false;
    }
    Matcher annotation = ANNOTATION.matcher(text).region((int) position, text.length());
    if (!annotation.lookingAt()) {
      return false;
    }
    String qualifier = annotation.group(1).replaceAll("\\s", "");
    if (!qualifier.isEmpty()) {
      return qualifier.startsWith("lombok.");
    }
    Matcher imports = LOMBOK_IMPORT.matcher(text);
    while (imports.find()) {
      if (imports.group(1).equals("*") || imports.group(1).equals(annotation.group(2))) {
        return true;
      }
    }
    return false;
  }

  private static String location(Diagnostic<? extends JavaFileObject> diagnostic) {
    return diagnostic.getSource() == null
        ? ""
        : Path.of(diagnostic.getSource().toUri()) + ":" + diagnostic.getLineNumber() + ": ";
  }

  private static String entry(Diagnostic<? extends JavaFileObject> diagnostic) {
    return "{\"file\":"
        + json(Path.of(diagnostic.getSource().toUri()).toString())
        + ",\"line\":"
        + diagnostic.getLineNumber()
        + ",\"column\":"
        + diagnostic.getColumnNumber()
        + ",\"kind\":"
        + json(diagnostic.getKind().name())
        + ",\"message\":"
        + json(diagnostic.getMessage(Locale.ROOT))
        + "}";
  }

  private static String json(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char character : text.toCharArray()) {
      switch (character) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (character < 0x20) {
            out.append(String.format("\\u%04x", (int) character));
          } else {
            out.append(character);
          }
        }
      }
    }
    return out.append('"').toString();
  }
}
