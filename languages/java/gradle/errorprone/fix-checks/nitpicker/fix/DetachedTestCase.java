package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.ClassTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.Tree;
import java.util.LinkedHashSet;
import java.util.Set;
import javax.lang.model.element.Modifier;

@BugPattern(
    summary = "Annotates a public void method of a test class with @Test so the runner executes it.",
    severity = WARNING)
public final class DetachedTestCase extends BugChecker implements ClassTreeMatcher {
  private static final String[] TESTS = {
    "org.junit.jupiter.api.Test", "org.junit.Test", "org.testng.annotations.Test"
  };
  private static final Set<String> HOOKS =
      Set.of("setUp", "tearDown", "setup", "teardown", "before", "after", "beforeEach", "afterEach");

  @Override
  public Description matchClass(ClassTree tree, VisitorState state) {
    if (tree.getKind() != Tree.Kind.CLASS || tree.getModifiers().getFlags().contains(Modifier.ABSTRACT)) {
      return Description.NO_MATCH;
    }
    Set<String> used = new LinkedHashSet<>();
    for (Tree member : tree.getMembers()) {
      if (member instanceof MethodTree method) {
        for (AnnotationTree annotation : method.getModifiers().getAnnotations()) {
          for (String test : TESTS) {
            if (Support.isAnnotation(annotation, test)) {
              used.add(test);
            }
          }
        }
      }
    }
    if (used.size() != 1) {
      return Description.NO_MATCH;
    }
    String test = used.iterator().next();
    for (Tree member : tree.getMembers()) {
      if (member instanceof MethodTree method && detached(method, state)) {
        SuggestedFix.Builder fix = SuggestedFix.builder();
        String name = SuggestedFixes.qualifyType(state, fix, test);
        int start = Support.start(method);
        String indent = Support.startsLine(start, state) ? Support.indentAt(start, state) : null;
        fix.prefixWith(method, "@" + name + (indent == null ? " " : "\n" + indent));
        state.reportMatch(describeMatch(method, fix.build()));
      }
    }
    return Description.NO_MATCH;
  }

  private static boolean detached(MethodTree method, VisitorState state) {
    Set<Modifier> flags = method.getModifiers().getFlags();
    return flags.contains(Modifier.PUBLIC)
        && !flags.contains(Modifier.STATIC)
        && !flags.contains(Modifier.ABSTRACT)
        && method.getModifiers().getAnnotations().isEmpty()
        && method.getParameters().isEmpty()
        && method.getBody() != null
        && method.getReturnType() != null
        && ASTHelpers.isSameType(ASTHelpers.getType(method.getReturnType()), state.getSymtab().voidType, state)
        && !HOOKS.contains(method.getName().toString());
  }
}
