import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TaskEvent;
import com.sun.source.util.TaskListener;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.tree.JCTree;
import com.sun.tools.javac.api.BasicJavacTask;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import javax.tools.*;

/** ErrorProneRun <mode ep|javac> <out.json> <checks.json> <classpath file> <sources file> [extra javac options...]; -Dep.test=true compiles as test-only code */
public class ErrorProneRun {
  public static void main(String[] a) throws Exception {
    boolean ep = a[0].equals("ep");
    String checks = Files.readString(Path.of(a[2]));
    List<String> cp = Files.readAllLines(Path.of(a[3])).stream().filter(s -> !s.isBlank()).toList();
    List<String> sources = Files.readAllLines(Path.of(a[4])).stream().filter(s -> !s.isBlank()).toList();
    Set<String> pk = new TreeSet<>();
    Pattern pkg = Pattern.compile("(?m)^\\s*package\\s+([\\w.]+)\\s*;");
    for (String s : sources) {
      Matcher m = pkg.matcher(new String(Files.readAllBytes(Path.of(s)), StandardCharsets.ISO_8859_1));
      if (m.find()) pk.add(m.group(1));
    }
    List<String> packages = pk.stream().filter(n -> pk.stream().noneMatch(o -> n.startsWith(o + "."))).toList();
    Path classes = Files.createDirectories(Path.of(a[1] + ".classes"));
    List<String> opts = new ArrayList<>(List.of("-d", classes.toString(), "-classpath", String.join(":", cp),
        "-sourcepath", "", "-encoding", "UTF-8", "-Xmaxwarns", "10000000", "-Xmaxerrs", "100000", "-nowarn", "-g", "-parameters"));
    for (int i = 5; i < a.length; i++) opts.add(a[i]);
    if (opts.lastIndexOf("-encoding") > opts.indexOf("-encoding")) { int i = opts.indexOf("-encoding"); opts.remove(i); opts.remove(i); }
    if (opts.contains("--module-path")) { int i = opts.indexOf("-sourcepath"); opts.remove(i); opts.remove(i); }
    if (ep) {
      List<String> f = new ArrayList<>(List.of("-Xplugin:ErrorProne", "-XepAllErrorsAsWarnings"));
      if (Boolean.getBoolean("ep.test")) f.add("-XepCompilingTestOnlyCode");
      String only = System.getProperty("ep.only", "");
      if (!only.isEmpty()) {
        f.add("-XepDisableAllChecks");
        for (String c : only.split(",")) f.add("-Xep:" + c + ":WARN");
      } else {
      if (!String.join(":", cp).contains("error_prone_annotations")) f.add("-Xep:Immutable:OFF");
      names(checks, "enable").forEach(c -> f.add("-Xep:" + c + ":WARN"));
      names(checks, "disable").forEach(c -> f.add("-Xep:" + c + ":OFF"));
      for (String c : System.getProperty("ep.off", "").split(",")) if (!c.isEmpty()) f.add("-Xep:" + c + ":OFF");
      f.add("-XepOpt:CheckReturnValue:Packages=" + String.join(",", packages));
      f.add("-Xep:NullAway:WARN");
      f.add("-XepOpt:NullAway:AnnotatedPackages=" + String.join(",", packages));
      for (String o : List.of("ExcludedFieldAnnotations", "ExcludedClassAnnotations", "CustomInitializerAnnotations",
          "CustomContractAnnotations", "CustomNullableAnnotations", "CustomNonnullAnnotations", "ExternalInitAnnotations"))
        if (!names(checks, o).isEmpty()) f.add("-XepOpt:NullAway:" + o + "=" + String.join(",", names(checks, o)));
      }
      opts.add(String.join(" ", f));
      opts.remove("-nowarn"); opts.addAll(List.of("-XDcompilePolicy=simple", "--should-stop=ifError=FLOW", "-XDaddTypeAnnotationsToSymbol=true"));
      String epcp = System.getProperty("ep.path");
      int pp = opts.indexOf("-processorpath");
      if (pp >= 0) opts.set(pp + 1, opts.get(pp + 1) + ":" + epcp); else opts.addAll(List.of("-processorpath", epcp));
      if (!opts.contains("-proc:none") && pp < 0) opts.add("-proc:none");
    }
    JavaCompiler c = ToolProvider.getSystemJavaCompiler();
    StandardJavaFileManager fm = c.getStandardFileManager(null, null, opts.get(opts.indexOf("-encoding") + 1).equals("UTF-8") ? StandardCharsets.UTF_8 : null);
    StringBuilder out = new StringBuilder("{\"findings\":[\n");
    int[] n = {0, 0};
    Pattern name = Pattern.compile("^\\[(\\w+)\\] ");
    Map<String, Map<Long, Boolean>> generated = new java.util.concurrent.ConcurrentHashMap<>();
    DiagnosticListener<JavaFileObject> l = d -> {
      String msg = d.getMessage(Locale.ROOT);
      Matcher m = name.matcher(msg);
      if (d.getKind() == Diagnostic.Kind.ERROR) { n[1]++; if (n[1] <= 30) { System.err.println(d); try { Files.writeString(Path.of(a[1] + ".error" + n[1]), d.toString()); } catch (Exception e) { } } }
      String check = m.find() ? m.group(1) : (d.getKind() == Diagnostic.Kind.ERROR ? "_error" : null);
      if (check == null || d.getSource() == null) return;
      String first = msg.split("\n")[0];
      int dym = msg.indexOf("\n  Did you mean ");
      String suggest = dym < 0 ? "" : msg.substring(dym + 3);
      synchronized (out) {
        out.append(n[0]++ == 0 ? "" : ",\n").append("{\"file\":").append(q(d.getSource().getName())).append(",\"line\":")
            .append(d.getLineNumber()).append(",\"col\":").append(d.getColumnNumber()).append(",\"start\":").append(d.getStartPosition())
            .append(",\"pos\":").append(d.getPosition()).append(",\"end\":").append(d.getEndPosition())
            .append(",\"check\":").append(q(check)).append(",\"message\":").append(q(first))
            .append(",\"suggest\":").append(q(suggest))
            .append(",\"generated\":").append(generated.getOrDefault(d.getSource().getName(), Map.of()).get(d.getPosition()) == Boolean.FALSE)
            .append(",\"shared\":").append(generated.getOrDefault(d.getSource().getName(), Map.of()).get(d.getPosition()) == Boolean.TRUE)
            .append("}");
      }
    };
    long t0 = System.nanoTime();
    JavacTask task = (JavacTask) c.getTask(null, fm, l, opts, null, fm.getJavaFileObjectsFromStrings(sources));
    task.addTaskListener(new TaskListener() {
      @Override public void started(TaskEvent e) {
        if (e.getKind() == TaskEvent.Kind.ANALYZE)
          generated.computeIfAbsent(e.getCompilationUnit().getSourceFile().getName(), n -> generatedPositions(e.getCompilationUnit(), opts.get(opts.indexOf("-encoding") + 1)));
      }
    });
    com.sun.tools.javac.util.Context ctx = ((BasicJavacTask) task).getContext();
    boolean ok = task.call();
    long wall = (System.nanoTime() - t0) / 1_000_000;
    out.append("\n],\"timings\":{");
    if (ep) {
      Map<String, java.time.Duration> t = com.google.errorprone.ErrorProneTimings.instance(ctx).timings();
      int k = 0;
      for (var e : t.entrySet()) out.append(k++ == 0 ? "" : ",").append(q(e.getKey())).append(":").append(e.getValue().toNanos() / 1e6);
    }
    out.append("},\"ok\":").append(ok).append(",\"errors\":").append(n[1]).append(",\"wallMs\":").append(wall)
        .append(",\"files\":").append(sources.size()).append("}\n");
    Files.writeString(Path.of(a[1]), out);
    System.err.println("ok=" + ok + " errors=" + n[1] + " findings=" + n[0] + " wall=" + wall + "ms");
  }
  /** Positions of trees an annotation processor added (trees a plain parse of the file does not give): false where
   * only added trees sit, true where a written tree has its position too. */
  static Map<Long, Boolean> generatedPositions(CompilationUnitTree unit, String encoding) {
    JavacTask raw = (JavacTask) ToolProvider.getSystemJavaCompiler().getTask(null, null, d -> { }, List.of("-proc:none", "-encoding", encoding),
        null, List.of(unit.getSourceFile()));
    Set<String> written = new HashSet<>();
    try {
      for (CompilationUnitTree parsed : raw.parse()) new TreeScanner<Void, Void>() {
        @Override public Void scan(Tree t, Void v) { if (t != null) written.add(key(t)); return super.scan(t, v); }
      }.scan(parsed, null);
    } catch (java.io.IOException e) { throw new java.io.UncheckedIOException(e); }
    Set<Long> added = new HashSet<>(), hand = new HashSet<>();
    new TreeScanner<Void, Void>() {
      @Override public Void scan(Tree t, Void v) {
        if (t == null) return null;
        JCTree n = (JCTree) t;
        if (!written.contains(key(t))) { if (n.getStartPosition() >= 0) added.add((long) n.getStartPosition()); if (n.getPreferredPosition() >= 0) added.add((long) n.getPreferredPosition()); }
        else if (t.getKind() != Tree.Kind.MODIFIERS && t.getKind() != Tree.Kind.ANNOTATION) hand.add((long) n.getPreferredPosition());
        return super.scan(t, v);
      }
    }.scan(unit, null);
    Map<Long, Boolean> places = new HashMap<>();
    for (Long at : added) places.put(at, hand.contains(at));
    return places;
  }
  static String key(Tree t) {
    JCTree n = (JCTree) t;
    return t.getKind() + ":" + n.getStartPosition() + ":" + n.getPreferredPosition();
  }
  static List<String> names(String checks, String key) {
    Matcher list = Pattern.compile("\"" + key + "\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(checks);
    return list.find() ? Pattern.compile("\"([^\"]+)\"").matcher(list.group(1)).results().map(x -> x.group(1)).toList() : List.of();
  }
  static String q(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (char ch : s.toCharArray()) {
      if (ch == '"' || ch == '\\') b.append('\\').append(ch);
      else if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
      else b.append(ch);
    }
    return b.append('"').toString();
  }
}
