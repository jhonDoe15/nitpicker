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
 * Compiles source sets with javac and Error Prone as its plugin, and writes the diagnostics as a JSON
 * array of {file, line, column, position, kind, message} (position: the character offset Error Prone
 * reports, -1 when unknown; it is one point, not a span). The Gradle and the Maven builds both run
 * it, so both get the same checks.
 *
 * <p>Usage: {@code ErrorProneReport <report.json> <checks.json> <arguments file>...}. Each arguments
 * file holds one javac argument per line, then a line {@code --sources} and one source file per
 * line. Some lines before {@code --sources} are not javac arguments: {@code --test-only} marks test
 * sources (NullAway is off there); {@code --own-classes=<directories>} (joined with the path
 * separator) gives the project's own top-level packages, which CheckReturnValue and NullAway cover;
 * {@code --release=<n>}, {@code --source=<n>} and {@code --target=<n>} are the build's own form of
 * the language level, kept as it is except that {@code --release} becomes {@code -source} and
 * {@code -target} next to an {@code --add-exports} or {@code --add-opens} of a JDK module; and
 * {@code --project-arg=<arg>} is one of the build's compiler arguments, of which only the preview,
 * module and {@code -A} processor options are kept. A {@code lombok.config} that sets {@code
 * lombok.addSuppressWarnings = false} for any source turns off the checks listed under {@code
 * lombokUnsuppressedOff} in checks.json, which crash on Lombok's generated code. A compilation that
 * fails (a compiler error, not an Error Prone finding: those are warnings) ends the program with
 * exit status 1 and the errors on standard error, so it is never read as a clean report.
 */
public final class ErrorProneReport {
  private static final String SOURCES = "--sources";
  private static final String TEST_ONLY = "--test-only";
  private static final String OWN_CLASSES = "--own-classes=";
  private static final String PROJECT_ARG = "--project-arg=";
  private static final List<String> MODULE_OPTIONS =
      List.of("--add-exports", "--add-modules", "--add-reads");
  private static final List<String> NULLAWAY_OPTIONS =
      List.of("ExcludedFieldAnnotations", "ExternalInitAnnotations", "CustomInitializerAnnotations");
  private static final Pattern NAME = Pattern.compile("\"([^\"]+)\"");
  private static final Pattern JDK_MODULE = Pattern.compile("^--add-(?:exports|opens)=(?:java|jdk)\\.");
  private static final Pattern ADD_SUPPRESS_WARNINGS =
      Pattern.compile("(?m)^\\s*lombok\\.addSuppressWarnings\\s*=\\s*(\\w+)");
  private static final Pattern STOP_BUBBLING =
      Pattern.compile("(?m)^\\s*config\\.stopBubbling\\s*=\\s*true\\b");

  private ErrorProneReport() {}

  public static void main(String[] args) throws IOException {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    String checks = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
    List<String> entries = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    for (int index = 2; index < args.length; index++) {
      compile(compiler, Path.of(args[index]), checks, entries, errors);
    }
    if (!errors.isEmpty()) {
      System.err.println(String.join("\n", errors));
      System.exit(1);
    }
    Files.writeString(
        Path.of(args[0]), "[" + String.join(",\n", entries) + "]\n", StandardCharsets.UTF_8);
  }

  /** Every package holding a class, without the ones nested in another such package. */
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

  static String pluginArgument(
      String checks, List<String> packages, boolean test, boolean lombokUnsuppressed) {
    List<String> flags = new ArrayList<>();
    flags.add("-Xplugin:ErrorProne");
    flags.add("-XepAllErrorsAsWarnings");
    if (test) {
      flags.add("-XepCompilingTestOnlyCode");
    }
    namesIn(checks, "enable").forEach(check -> flags.add("-Xep:" + check + ":WARN"));
    namesIn(checks, "disable").forEach(check -> flags.add("-Xep:" + check + ":OFF"));
    if (lombokUnsuppressed) {
      namesIn(checks, "lombokUnsuppressedOff").forEach(check -> flags.add("-Xep:" + check + ":OFF"));
    }
    if (!packages.isEmpty()) {
      flags.add("-XepOpt:CheckReturnValue:Packages=" + String.join(",", packages));
    }
    if (test || packages.isEmpty()) {
      flags.add("-Xep:NullAway:OFF");
    } else {
      flags.add("-Xep:NullAway:WARN");
      flags.add("-XepOpt:NullAway:AnnotatedPackages=" + String.join(",", packages));
      for (String option : NULLAWAY_OPTIONS) {
        List<String> values = namesIn(checks, option);
        if (!values.isEmpty()) {
          flags.add("-XepOpt:NullAway:" + option + "=" + String.join(",", values));
        }
      }
    }
    return String.join(" ", flags);
  }

  static List<String> javacOptions(List<String> lines) {
    List<String> options = new ArrayList<>();
    List<String> projectArgs = new ArrayList<>();
    Map<String, String> level = new HashMap<>();
    for (String line : lines) {
      Matcher form = Pattern.compile("^--(release|source|target)=(.+)$").matcher(line);
      if (line.startsWith(PROJECT_ARG)) {
        projectArgs.add(line.substring(PROJECT_ARG.length()));
      } else if (form.matches()) {
        level.put(form.group(1), form.group(2));
      } else if (!line.equals(TEST_ONLY) && !line.startsWith(OWN_CLASSES)) {
        options.add(line);
      }
    }
    List<String> passed = normalized(projectArgs);
    options.addAll(passed.stream().filter(ErrorProneReport::kept).toList());
    String release = level.get("release");
    if (release != null && passed.stream().noneMatch(arg -> JDK_MODULE.matcher(arg).find())) {
      options.addAll(List.of("--release", release));
    } else {
      for (String form : List.of("source", "target")) {
        String value = release != null ? release : level.get(form);
        if (value != null) {
          options.addAll(List.of("-" + form, value));
        }
      }
    }
    return options;
  }

  /** The build's arguments, with a module option and its value joined as {@code option=value}. */
  private static List<String> normalized(List<String> args) {
    List<String> joined = new ArrayList<>();
    for (int index = 0; index < args.size(); index++) {
      String argument = args.get(index);
      boolean pair = MODULE_OPTIONS.contains(argument) || argument.equals("--add-opens");
      joined.add(pair && index + 1 < args.size() ? argument + "=" + args.get(++index) : argument);
    }
    return joined;
  }

  private static boolean kept(String argument) {
    return argument.equals("--enable-preview")
        || argument.startsWith("-A")
        || MODULE_OPTIONS.stream().anyMatch(option -> argument.startsWith(option + "="));
  }

  /** Whether the nearest lombok.config that sets it turns Lombok's @SuppressWarnings off. */
  static boolean lombokUnsuppressed(List<String> sources) throws IOException {
    for (Path directory :
        sources.stream().map(source -> Path.of(source).toAbsolutePath().getParent()).distinct().toList()) {
      for (Path current = directory; current != null; current = current.getParent()) {
        Path config = current.resolve("lombok.config");
        String text = Files.isRegularFile(config) ? Files.readString(config, StandardCharsets.UTF_8) : "";
        Matcher setting = ADD_SUPPRESS_WARNINGS.matcher(text);
        if (setting.find() && setting.group(1).equalsIgnoreCase("false")) {
          return true;
        } else if (setting.find(0) || STOP_BUBBLING.matcher(text).find()) {
          break;
        }
      }
    }
    return false;
  }

  private static void compile(
      JavaCompiler compiler,
      Path argumentsFile,
      String checks,
      List<String> entries,
      List<String> errors)
      throws IOException {
    List<String> lines = Files.readAllLines(argumentsFile, StandardCharsets.UTF_8);
    int separator = lines.indexOf(SOURCES);
    List<String> head = lines.subList(0, separator);
    List<String> sources = lines.subList(separator + 1, lines.size());
    if (sources.isEmpty()) {
      return;
    }
    String ownClasses =
        head.stream().filter(line -> line.startsWith(OWN_CLASSES)).findFirst().orElse(OWN_CLASSES);
    List<String> options = javacOptions(head);
    options.add(
        pluginArgument(
            checks,
            ownPackages(ownClasses.substring(OWN_CLASSES.length())),
            head.contains(TEST_ONLY),
            lombokUnsuppressed(sources)));
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
    for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
      String code = diagnostic.getCode() == null ? "" : diagnostic.getCode();
      if (code.endsWith(".error.prone") && diagnostic.getSource() != null) {
        entries.add(entry(diagnostic));
      } else if (diagnostic.getKind() == Diagnostic.Kind.ERROR) {
        errors.add(location(diagnostic) + diagnostic.getMessage(Locale.ROOT));
      }
    }
    if (!compiled && errors.isEmpty()) {
      errors.add("javac failed on " + argumentsFile + " without reporting an error");
    }
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
        + ",\"position\":"
        + diagnostic.getPosition()
        + ",\"kind\":"
        + json(diagnostic.getKind().name())
        + ",\"message\":"
        + json(diagnostic.getMessage(Locale.ROOT))
        + "}";
  }

  private static String json(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char character : text.toCharArray()) {
      if (character == '"' || character == '\\') {
        out.append('\\').append(character);
      } else if (character < 0x20) {
        out.append(String.format("\\u%04x", (int) character));
      } else {
        out.append(character);
      }
    }
    return out.append('"').toString();
  }
}
