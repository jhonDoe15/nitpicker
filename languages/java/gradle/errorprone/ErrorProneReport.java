import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.util.stream.*;
import javax.lang.model.element.*;
import javax.tools.*;

/**
 * Compiles source sets with javac and Error Prone as its plugin and writes the diagnostics, and the checks that
 * crashed, as a JSON array. Usage: {@code ErrorProneReport <report.json> <checks.json> <arguments file>...}; the
 * report, the arguments files and the crash handling are described in docs/java-preset/error-prone-and-nullaway.md.
 * A failed compilation exits with status 1 and javac's errors on stderr.
 */
public final class ErrorProneReport {
  private static final String SOURCES = "--sources";
  private static final String TEST_ONLY = "--test-only";
  private static final String OWN_CLASSES = "--own-classes=";
  private static final String PROJECT_ARG = "--project-arg=";
  private static final String PROJECT_FLAG = "--errorprone-flag=";
  private static final String PATCH_LOCATION = PROJECT_FLAG + "-XepPatchLocation:";
  private static final String FIX_CHECKS = PROJECT_FLAG + "-XepNitpickerFixChecks:";
  private static final String PROCESSOR_PATH = "-processorpath";
  private static final List<String> MODULE_OPTIONS = List.of("--add-exports", "--add-modules", "--add-reads");
  private static final List<String> NULLAWAY_OPTIONS =
      List.of("ExcludedFieldAnnotations", "ExternalInitAnnotations", "CustomInitializerAnnotations");
  private static final Pattern NAME = Pattern.compile("\"([^\"]+)\"");
  private static final Pattern JDK_MODULE = Pattern.compile("^--add-exports=(?:java|jdk)\\.");
  private static final Pattern ADD_SUPPRESS_WARNINGS =
      Pattern.compile("(?m)^\\s*lombok\\.addSuppressWarnings\\s*=\\s*(\\w+)");
  private static final Pattern STOP_BUBBLING = Pattern.compile("(?m)^\\s*config\\.stopBubbling\\s*=\\s*true\\b");
  private static final Pattern CRASH = Pattern.compile("BugPattern: (\\w+)(?:[\\s\\S]*?Stack Trace:\\s*(.+))?");

  private static final Map<String, Path> FIX_CHECK_CLASSES = new HashMap<>();

  private ErrorProneReport() {}

  private record ClassSpan(long start, long end, List<String> annotations) {}

  public static void main(String[] args) throws IOException {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    String checks = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
    List<String> entries = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    Map<String, String> crashes = new LinkedHashMap<>();
    try {
      for (int index = 2; index < args.length; index++) {
        compile(compiler, Path.of(args[index]), checks, entries, errors, crashes);
      }
    } finally {
      for (Path built : FIX_CHECK_CLASSES.values()) {
        try (Stream<Path> files = Files.walk(built)) {
          files.sorted(Comparator.reverseOrder()).forEach(file -> file.toFile().delete());
        }
      }
    }
    entries.addAll(crashes.values());
    if (!errors.isEmpty()) {
      System.err.println(String.join("\n", errors));
      System.exit(1);
    }
    Files.writeString(Path.of(args[0]), "[" + String.join(",\n", entries) + "]\n", StandardCharsets.UTF_8);
  }

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
        .filter(name -> sorted.stream().noneMatch(other -> name.startsWith(other + "."))).toList();
  }

  static List<String> namesIn(String checks, String key) {
    Matcher list = Pattern.compile("\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(checks);
    return list.find() ? NAME.matcher(list.group(1)).results().map(name -> name.group(1)).toList() : List.of();
  }

  static String pluginArgument(String checks, List<String> packages, boolean test, boolean lombokUnsuppressed,
      List<String> projectLines) {
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
      NULLAWAY_OPTIONS.stream().filter(option -> !namesIn(checks, option).isEmpty()).forEach(option ->
          flags.add("-XepOpt:NullAway:" + option + "=" + String.join(",", namesIn(checks, option))));
    }
    projectLines.forEach(line -> flags.add(line.substring(PROJECT_FLAG.length())));
    return String.join(" ", flags);
  }

  static List<String> projectLines(List<String> head, String patchDirectory) {
    return head.stream().filter(line -> line.startsWith(PROJECT_FLAG) && !line.startsWith(FIX_CHECKS))
        .map(line -> line.startsWith(PATCH_LOCATION) && !line.endsWith(":IN_PLACE")
            ? line + "/" + patchDirectory : line)
        .toList();
  }

  /**
   * Compiles the fix-only checks of the {@code -XepNitpickerFixChecks:<folder>} flag against the processor path and
   * returns the folder holding their classes and service file, or null when the flag is absent. They run only in
   * the patch compile of --fix and are never part of the findings run.
   */
  static Path fixChecks(JavaCompiler compiler, List<String> head, Map<String, Path> built) throws IOException {
    Optional<String> flag = head.stream().filter(line -> line.startsWith(FIX_CHECKS)).findFirst();
    int path = head.indexOf(PROCESSOR_PATH) + 1;
    if (flag.isEmpty() || path == 0) {
      return null;
    }
    Path sources = Path.of(flag.get().substring(FIX_CHECKS.length()));
    String classpath = head.get(path);
    Path cached = built.get(sources + "|" + classpath);
    if (cached != null) {
      return cached;
    }
    Path output = Files.createTempDirectory("nitpicker-fix-checks");
    List<String> files;
    try (Stream<Path> walk = Files.walk(sources)) {
      files = walk.filter(file -> file.toString().endsWith(".java")).map(Path::toString).sorted().toList();
    }
    List<String> options = new ArrayList<>(List.of("-proc:none", "-d", output.toString(), "-classpath", classpath));
    for (String name : List.of("api", "file", "main", "model", "parser", "processing", "tree", "util", "code", "comp")) {
      options.add("--add-exports=jdk.compiler/com.sun.tools.javac." + name + "=ALL-UNNAMED");
    }
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    try (StandardJavaFileManager manager =
        compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
      if (!compiler.getTask(null, manager, diagnostics, options, null, manager.getJavaFileObjectsFromStrings(files))
          .call()) {
        throw new IOException("The fix checks do not compile: " + diagnostics.getDiagnostics());
      }
    }
    Path services = sources.resolve("META-INF");
    try (Stream<Path> walk = Files.walk(services)) {
      for (Path file : walk.filter(Files::isRegularFile).toList()) {
        Path target = output.resolve("META-INF").resolve(services.relativize(file).toString());
        Files.createDirectories(target.getParent());
        Files.copy(file, target);
      }
    }
    built.put(sources + "|" + classpath, output);
    return output;
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
      } else if (!line.equals(TEST_ONLY) && !line.startsWith(OWN_CLASSES) && !line.startsWith(PROJECT_FLAG)) {
        options.add(line);
      }
    }
    List<String> passed = normalized(projectArgs).stream().filter(ErrorProneReport::kept).toList();
    options.addAll(passed);
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

  static List<String> lombokUnsuppressed(List<String> sources) throws IOException {
    Map<Path, Boolean> directories = new HashMap<>();
    for (Path directory : sources.stream().map(source -> Path.of(source).toAbsolutePath().getParent()).toList()) {
      if (!directories.containsKey(directory)) {
        directories.put(directory, unsuppressedIn(directory));
      }
    }
    return sources.stream().filter(source -> directories.get(Path.of(source).toAbsolutePath().getParent())).toList();
  }

  private static boolean unsuppressedIn(Path directory) throws IOException {
    for (Path current = directory; current != null; current = current.getParent()) {
      Path config = current.resolve("lombok.config");
      String text = Files.isRegularFile(config) ? Files.readString(config, StandardCharsets.UTF_8) : "";
      Matcher setting = ADD_SUPPRESS_WARNINGS.matcher(text);
      if (setting.find() || STOP_BUBBLING.matcher(text).find()) {
        return setting.find(0) && setting.group(1).equalsIgnoreCase("false");
      }
    }
    return false;
  }

  private static void compile(JavaCompiler compiler, Path argumentsFile, String checks, List<String> entries,
      List<String> errors, Map<String, String> crashes) throws IOException {
    List<String> lines = Files.readAllLines(argumentsFile, StandardCharsets.UTF_8);
    int separator = lines.indexOf(SOURCES);
    List<String> head = lines.subList(0, separator);
    List<String> sources = lines.subList(separator + 1, lines.size());
    String ownClasses = head.stream().filter(line -> line.startsWith(OWN_CLASSES)).findFirst()
        .orElse(OWN_CLASSES).substring(OWN_CLASSES.length());
    Path fixChecks = fixChecks(compiler, head, FIX_CHECK_CLASSES);
    List<String> unsuppressed = lombokUnsuppressed(sources);
    List<String> others = sources.stream().filter(source -> !unsuppressed.contains(source)).toList();
    for (List<String> group : Stream.of(others, unsuppressed).filter(list -> !list.isEmpty()).toList()) {
      List<String> options = javacOptions(head);
      if (fixChecks != null) {
        int processors = options.indexOf(PROCESSOR_PATH) + 1;
        options.set(processors, options.get(processors) + java.io.File.pathSeparator + fixChecks);
      }
      if (group.size() < sources.size()) {
        int classpath = options.indexOf("-classpath") + 1;
        options.set(classpath, options.get(classpath) + java.io.File.pathSeparator + ownClasses);
      }
      String patchDirectory = Integer.toHexString(argumentsFile.toAbsolutePath().normalize().toString().hashCode())
          + (group == unsuppressed ? "-lombok" : "");
      options.add(pluginArgument(checks, ownPackages(ownClasses), head.contains(TEST_ONLY),
          group == unsuppressed, projectLines(head, patchDirectory)));
      if (failedSilently(compiler, options, group, entries, errors, crashes)) {
        errors.add("javac failed on " + argumentsFile + " without reporting an error");
      }
    }
  }

  private static boolean failedSilently(JavaCompiler compiler, List<String> options, List<String> sources,
      List<String> entries, List<String> errors, Map<String, String> crashes) throws IOException {
    List<String> run = new ArrayList<>(options);
    run.set(run.size() - 1, run.getLast() + crashes.keySet().stream().map(check -> " -Xep:" + check + ":OFF")
        .collect(Collectors.joining()));
    DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
    boolean compiled;
    Map<String, List<ClassSpan>> classes = new HashMap<>();
    try (StandardJavaFileManager files =
        compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
      JavacTask task = (JavacTask) compiler.getTask(
          null, files, diagnostics, run, null, files.getJavaFileObjectsFromStrings(sources));
      recordClasses(task, classes);
      compiled = task.call();
    }
    int foundBefore = entries.size();
    int errorsBefore = errors.size();
    int crashesBefore = crashes.size();
    for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
      String code = diagnostic.getCode() == null ? "" : diagnostic.getCode();
      Matcher crash = CRASH.matcher(diagnostic.getMessage(Locale.ROOT));
      if (code.endsWith(".error.prone") && diagnostic.getSource() != null) {
        entries.add(entry(diagnostic, classes));
      } else if (code.endsWith(".error.prone.crash") && diagnostic.getSource() != null && crash.find()) {
        crashes.putIfAbsent(crash.group(1), "{\"crash\":" + json(crash.group(1)) + ",\"cause\":"
            + json(Objects.toString(crash.group(2), "").strip()) + "," + entry(diagnostic, Map.of()).substring(1));
      } else if (diagnostic.getKind() == Diagnostic.Kind.ERROR) {
        errors.add(location(diagnostic) + diagnostic.getMessage(Locale.ROOT));
      }
    }
    if (crashes.size() > crashesBefore) {
      entries.subList(foundBefore, entries.size()).clear();
      errors.subList(errorsBefore, errors.size()).clear();
      return failedSilently(compiler, options, sources, entries, errors, crashes);
    }
    return !compiled && errors.size() == errorsBefore;
  }

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
    return diagnostic.getSource() == null ? ""
        : Path.of(diagnostic.getSource().toUri()) + ":" + diagnostic.getLineNumber() + ": ";
  }

  private static String entry(
      Diagnostic<? extends JavaFileObject> diagnostic, Map<String, List<ClassSpan>> classes) {
    String file = Path.of(diagnostic.getSource().toUri()).toString();
    long position = diagnostic.getPosition();
    List<String> annotations = classes.getOrDefault(file, List.of()).stream()
            .filter(span -> span.start() <= position && position < span.end())
            .sorted((left, right) -> Long.compare(right.start(), left.start()))
            .flatMap(span -> span.annotations().stream())
            .distinct().toList();
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
