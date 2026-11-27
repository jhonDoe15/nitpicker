import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

/** PrettyDump <sources file>: prints, per call argument, file, start offset, end offset and the tree's toString as JSON lines. */
public class PrettyDump {
  public static void main(String[] a) throws Exception {
    JavaCompiler c = ToolProvider.getSystemJavaCompiler();
    StandardJavaFileManager fm = c.getStandardFileManager(null, null, java.nio.charset.StandardCharsets.UTF_8);
    List<String> files = Files.readAllLines(Path.of(a[0])).stream().filter(s -> !s.isBlank()).toList();
    StringBuilder out = new StringBuilder();
    for (String f : files) {
      JavacTask task = (JavacTask) c.getTask(null, fm, d -> {}, List.of("-proc:none", "--enable-preview", "--release", "21"), null, fm.getJavaFileObjects(f));
      for (CompilationUnitTree unit : task.parse()) {
        SourcePositions pos = Trees.instance(task).getSourcePositions();
        new TreePathScanner<Void, Void>() {
          void dump(Tree t) {
            long s = pos.getStartPosition(unit, t), e = pos.getEndPosition(unit, t);
            out.append("{\"file\":").append(q(f)).append(",\"start\":").append(s).append(",\"end\":").append(e)
               .append(",\"text\":").append(q(t.toString())).append("}\n");
          }
          @Override public Void visitMethodInvocation(MethodInvocationTree t, Void v) { t.getArguments().forEach(this::dump); return super.visitMethodInvocation(t, v); }
          @Override public Void visitNewClass(NewClassTree t, Void v) { t.getArguments().forEach(this::dump); return super.visitNewClass(t, v); }
        }.scan(unit, null);
      }
    }
    System.out.print(out);
  }
  static String q(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (char ch : s.toCharArray()) {
      if (ch == '"' || ch == '\\') b.append('\\').append(ch);
      else if (ch < 0x20 || ch > 0x7e) b.append(String.format("\\u%04x", (int) ch));
      else b.append(ch);
    }
    return b.append('"').toString();
  }
}
