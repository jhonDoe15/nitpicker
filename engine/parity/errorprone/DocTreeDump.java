import com.sun.source.doctree.*;
import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

/** Black-box dump of the doc comment trees javac builds: DocTreeDump <sources.txt> <out>. */
public class DocTreeDump {
    static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '\n') b.append("\\n"); else if (c == '\r') b.append("\\r"); else if (c == '\t') b.append("\\t");
            else if (c == '"') b.append("\\\""); else if (c == '\\') b.append("\\\\"); else b.append(c);
        }
        return b.append('"').toString();
    }
    static String label(DocTree t) {
        switch (t.getKind()) {
            case TEXT: return quote(((TextTree) t).getBody());
            case COMMENT: return quote(((CommentTree) t).getBody());
            case ERRONEOUS: { com.sun.source.doctree.ErroneousTree e = (com.sun.source.doctree.ErroneousTree) t; return quote(e.getBody()) + " " + e.getDiagnostic().getCode(); }
            case START_ELEMENT: return ((StartElementTree) t).getName() + (((StartElementTree) t).isSelfClosing() ? " /" : "");
            case END_ELEMENT: return ((EndElementTree) t).getName().toString();
            case ATTRIBUTE: return ((AttributeTree) t).getName() + " " + ((AttributeTree) t).getValueKind();
            case ENTITY: return ((EntityTree) t).getName().toString();
            case IDENTIFIER: return ((com.sun.source.doctree.IdentifierTree) t).getName().toString();
            case REFERENCE: return quote(((ReferenceTree) t).getSignature());
            case PARAM: return "param" + (((ParamTree) t).isTypeParameter() ? " <>" : "");
            case DOC_COMMENT: return "";
            default:
                if (t.getKind().name().equals("ESCAPE")) return quote(t.toString());
                if (t instanceof BlockTagTree) return ((BlockTagTree) t).getTagName();
                if (t instanceof InlineTagTree) return ((InlineTagTree) t).getTagName();
                return "";
        }
    }
    public static void main(String[] args) throws Exception {
        List<String> files = Files.readAllLines(Paths.get(args[0]));
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        StandardJavaFileManager fm = compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8);
        List<String> options = new ArrayList<>(Arrays.asList("-proc:none", "--enable-preview", "--release", "21", "-Xmaxerrs", "0"));
        JavacTask task = (JavacTask) compiler.getTask(new PrintWriter(new StringWriter()), fm, d -> {}, options, null, fm.getJavaFileObjectsFromStrings(files));
        DocTrees trees = DocTrees.instance(task);
        DocSourcePositions positions = trees.getSourcePositions();
        try (PrintWriter file = new PrintWriter(new BufferedWriter(new OutputStreamWriter(new FileOutputStream(args[1]), StandardCharsets.UTF_8)))) {
            for (CompilationUnitTree unit : task.parse()) {
                String path = unit.getSourceFile().getName();
                new TreePathScanner<Void, Void>() {
                    void doc() {
                        DocCommentTree doc = trees.getDocCommentTree(getCurrentPath());
                        if (doc == null) return;
                        long declaration = trees.getSourcePositions().getStartPosition(unit, getCurrentPath().getLeaf());
                        StringWriter rows = new StringWriter();
                        PrintWriter out = new PrintWriter(rows);
                        out.println("#C " + declaration + " " + path);
                        try {
                        new DocTreeScanner<Void, Void>() {
                            int depth = 0;
                            @Override public Void scan(DocTree t, Void p) {
                                if (t == null) return null;
                                out.println(depth + " " + t.getKind() + " " + positions.getStartPosition(unit, doc, t) + " " + positions.getEndPosition(unit, doc, t) + " " + label(t));
                                depth++;
                                super.scan(t, p);
                                depth--;
                                return null;
                            }
                        }.scan(doc, null);
                        } catch (RuntimeException crashed) {
                            return;
                        }
                        out.flush();
                        file.print(rows);
                    }
                    @Override public Void visitClass(ClassTree t, Void p) { doc(); return super.visitClass(t, p); }
                    @Override public Void visitMethod(MethodTree t, Void p) { doc(); return super.visitMethod(t, p); }
                    @Override public Void visitVariable(VariableTree t, Void p) { doc(); return super.visitVariable(t, p); }
                }.scan(unit, null);
            }
        }
    }
}
