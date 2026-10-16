import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TaskEvent;
import com.sun.source.util.TaskListener;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;
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
import java.util.stream.Collectors;
import java.util.stream.Stream;
import javax.lang.model.element.AnnotationMirror;
import javax.lang.model.element.Element;
import javax.lang.model.element.TypeElement;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Compiles source sets with javac and Error Prone as its plugin, and writes the diagnostics as a JSON
 * array of {file, line, column, position, kind, message, classAnnotations}: position is the one offset
 * Error Prone reports, classAnnotations the annotations (meta-annotations included) of the innermost
 * class around it. Usage: {@code ErrorProneReport <report.json> <checks.json> <arguments file>...};
 * each arguments file holds javac arguments, then {@code --sources} and the sources, one per line.
 * The non-javac lines ({@code --test-only}, {@code --own-classes=}, {@code --release=}, {@code
 * --source=}, {@code --target=}, {@code --project-arg=}) and lombok.config handling are described in
 * docs/java-preset.md. A failed compilation exits with status 1 and javac's errors on stderr.
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

  private record ClassSpan(long start, long end, List<String> annotations) {}

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
    Files.writeString(Path.of(args[0]), "[" + String.join(",\n", entries) + "]\n", StandardCharsets.UTF_8);
  }

  /** Every package holding a class, without the ones nested in another such package. */
  static List<String> ownPackages(String classDirectories) throws IOException {
    List<String> packages = new ArrayList<>();
    for (Path root : Stream.of(classDirectories.split(java.io.File.pathSeparator)).filter(d -> !d.isEmpty())
        .map(Path::of).filter(Files::isDirectory).toList()) {
      try (Stream<Path> files = Files.walk(root)) {
        files.filter(file -> file.toString().endsWith(".class"))
            .map(file -> root.relativize(file.getParent()).toString().replace(java.io.File.separatorChar, '.'))
            .filter(name -> !name.isEmpty()).forEach(packages::add);
      }
    }
    List<String> sorted = packages.stream().distinct().sorted().toList();
    return sorted.stream()
        .filter(name -> sorted.stream().noneMatch(other -> name.startsWith(other + ".")))
        .toList();
  }

  static List<String> namesIn(String checks, String key) {
    Matcher list = Pattern.compile("\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(checks);
    return list.find() ? NAME.matcher(list.group(1)).results().map(name -> name.group(1)).toList() : List.of();
  }

  static String pluginArgument(
      String checks, List<String> packages, boolean test, boolean lombokUnsuppressed) {
    List<String> flags = new ArrayList<>(List.of("-Xplugin:ErrorProne", "-XepAllErrorsAsWarnings"));
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
    return argument.equals("--enable-preview") || argument.startsWith("-A")
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

  private static void compile(JavaCompiler compiler, Path argumentsFile, String checks, List<String> entries,
      List<String> errors) throws IOException {
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
    options.add(pluginArgument(checks, ownPackages(ownClasses.substring(OWN_CLASSES.length())),
        head.contains(TEST_ONLY), lombokUnsuppressed(sources)));
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    boolean compiled;
    Map<String, List<ClassSpan>> classes = new HashMap<>();
    try (StandardJavaFileManager files =
        compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
      JavacTask task = (JavacTask) compiler.getTask(
          null, files, diagnostics, options, null, files.getJavaFileObjectsFromStrings(sources));
      recordClasses(task, classes);
      compiled = task.call();
    }
    for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
      String code = diagnostic.getCode() == null ? "" : diagnostic.getCode();
      if (code.endsWith(".error.prone") && diagnostic.getSource() != null) {
        entries.add(entry(diagnostic, classes));
      } else if (diagnostic.getKind() == Diagnostic.Kind.ERROR) {
        errors.add(location(diagnostic) + diagnostic.getMessage(Locale.ROOT));
      }
    }
    if (!compiled && errors.isEmpty()) {
      errors.add("javac failed on " + argumentsFile + " without reporting an error");
    }
  }

  /** Records each analyzed class's span and annotations, keyed by its source file's path. */
  private static void recordClasses(JavacTask task, Map<String, List<ClassSpan>> classes) {
    Trees trees = Trees.instance(task);
    task.addTaskListener(
        new TaskListener() {
          @Override
          public void finished(TaskEvent event) {
            TreePath top = event.getTypeElement() == null ? null : trees.getPath(event.getTypeElement());
            if (event.getKind() != TaskEvent.Kind.ANALYZE || top == null) {
              return;
            }
            CompilationUnitTree unit = top.getCompilationUnit();
            List<ClassSpan> spans =
                classes.computeIfAbsent(Path.of(unit.getSourceFile().toUri()).toString(), file -> new ArrayList<>());
            new TreePathScanner<Void, Void>() {
              @Override
              public Void visitClass(ClassTree tree, Void unused) {
                SourcePositions at = trees.getSourcePositions();
                spans.add(new ClassSpan(at.getStartPosition(unit, tree), at.getEndPosition(unit, tree),
                    annotationNames(trees.getElement(getCurrentPath()), new ArrayList<>())));
                return super.visitClass(tree, unused);
              }
            }.scan(top, null);
          }
        });
  }

  private static List<String> annotationNames(Element element, List<String> names) {
    for (AnnotationMirror mirror : element == null ? List.<AnnotationMirror>of() : element.getAnnotationMirrors()) {
      TypeElement type = (TypeElement) mirror.getAnnotationType().asElement();
      String name = type.getQualifiedName().toString();
      if (!name.startsWith("java.lang.annotation.") && !names.contains(name)) {
        names.add(name);
        annotationNames(type, names);
      }
    }
    return names;
  }

  private static String location(Diagnostic<? extends JavaFileObject> diagnostic) {
    return diagnostic.getSource() == null
        ? ""
        : Path.of(diagnostic.getSource().toUri()) + ":" + diagnostic.getLineNumber() + ": ";
  }

  private static String entry(
      Diagnostic<? extends JavaFileObject> diagnostic, Map<String, List<ClassSpan>> classes) {
    String file = Path.of(diagnostic.getSource().toUri()).toString();
    long position = diagnostic.getPosition();
    List<String> annotations = classes.getOrDefault(file, List.of()).stream()
            .filter(span -> span.start() <= position && position < span.end())
            .max((left, right) -> Long.compare(left.start(), right.start()))
            .map(ClassSpan::annotations)
            .orElse(List.of());
    return String.format(
        "{\"file\":%s,\"line\":%d,\"column\":%d,\"position\":%d,\"kind\":%s,\"message\":%s,"
            + "\"classAnnotations\":[%s]}",
        json(file), diagnostic.getLineNumber(), diagnostic.getColumnNumber(), position,
        json(diagnostic.getKind().name()), json(diagnostic.getMessage(Locale.ROOT)),
        annotations.stream().map(ErrorProneReport::json).collect(Collectors.joining(",")));
  }

  private static String json(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char character : text.toCharArray()) {
      boolean quoted = character == '"' || character == '\\';
      out.append(character < 0x20 ? String.format("\\u%04x", (int) character) : quoted ? "\\" + character : character);
    }
    return out.append('"').toString();
  }
}
