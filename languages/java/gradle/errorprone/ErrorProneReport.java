import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Compiles source sets with javac and Error Prone as its plugin, and writes the Error Prone
 * diagnostics as a JSON array of {file, line, column, kind, message}.
 *
 * <p>Usage: {@code ErrorProneReport <report.json> <arguments file>...}. Each arguments file holds
 * one javac argument per line, then a line {@code --sources} and one source file per line. A
 * compilation that fails (a compiler error, not an Error Prone finding: those are warnings) ends
 * the program with exit status 1 and the errors on standard error, so it is never read as a clean
 * report.
 */
public final class ErrorProneReport {
  private static final String SOURCES = "--sources";

  private ErrorProneReport() {}

  public static void main(String[] args) throws IOException {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    List<String> entries = new ArrayList<>();
    List<String> errors = new ArrayList<>();
    for (int index = 1; index < args.length; index++) {
      compile(compiler, Path.of(args[index]), entries, errors);
    }
    if (!errors.isEmpty()) {
      System.err.println(String.join("\n", errors));
      System.exit(1);
    }
    Files.writeString(
        Path.of(args[0]), "[" + String.join(",\n", entries) + "]\n", StandardCharsets.UTF_8);
  }

  private static void compile(
      JavaCompiler compiler, Path argumentsFile, List<String> entries, List<String> errors)
      throws IOException {
    List<String> lines = Files.readAllLines(argumentsFile, StandardCharsets.UTF_8);
    int separator = lines.indexOf(SOURCES);
    List<String> options = lines.subList(0, separator);
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
