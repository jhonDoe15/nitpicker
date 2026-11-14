package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.ClassTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.Tree;
import java.util.ArrayList;
import java.util.List;

@BugPattern(
    summary = "Uses @RestController for a JSON controller and drops @ResponseBody.",
    severity = WARNING)
public final class SpringRestController extends BugChecker implements ClassTreeMatcher {
  private static final String REST = "org.springframework.web.bind.annotation.RestController";
  private static final String CONTROLLER = "org.springframework.stereotype.Controller";
  private static final String BODY = "org.springframework.web.bind.annotation.ResponseBody";

  private record Plan(List<AnnotationTree> bodies, AnnotationTree controller, boolean rest) {}

  @Override
  public Description matchClass(ClassTree tree, VisitorState state) {
    Plan plan = plan(tree);
    if (plan == null) {
      return Description.NO_MATCH;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    for (AnnotationTree body : plan.bodies) {
      int[] range = Support.removalRange(body, state);
      fix.replace(range[0], range[1], "");
    }
    if (!plan.rest) {
      String name = SuggestedFixes.qualifyType(state, fix, REST);
      fix.replace(plan.controller.getAnnotationType(), name);
    }
    List<int[]> controllers = new ArrayList<>();
    List<int[]> bodies = new ArrayList<>();
    for (ClassTree other : Support.classes(state)) {
      Plan found = plan(other);
      if (found != null) {
        found.bodies.forEach(body -> bodies.add(Support.removalRange(body, state)));
        if (!found.rest) {
          controllers.add(new int[] {Support.start(found.controller), Support.end(found.controller, state)});
        }
      }
    }
    Support.dropImportIfUnused(fix, state, "Controller", controllers);
    Support.dropImportIfUnused(fix, state, "ResponseBody", bodies);
    return describeMatch(plan.bodies.get(0), fix.build());
  }

  private static Plan plan(ClassTree tree) {
    AnnotationTree rest = find(tree.getModifiers().getAnnotations(), REST);
    AnnotationTree controller = find(tree.getModifiers().getAnnotations(), CONTROLLER);
    List<AnnotationTree> bodies = new ArrayList<>();
    AnnotationTree classBody = find(tree.getModifiers().getAnnotations(), BODY);
    if (rest != null) {
      addAll(bodies, tree.getModifiers().getAnnotations());
      for (Tree member : tree.getMembers()) {
        if (member instanceof MethodTree method) {
          addAll(bodies, method.getModifiers().getAnnotations());
        }
      }
    } else if (controller != null && classBody != null) {
      bodies.add(classBody);
    }
    return bodies.isEmpty() ? null : new Plan(bodies, controller, rest != null);
  }

  private static AnnotationTree find(List<? extends AnnotationTree> annotations, String name) {
    for (AnnotationTree annotation : annotations) {
      if (Support.isAnnotation(annotation, name)) {
        return annotation;
      }
    }
    return null;
  }

  private static void addAll(List<AnnotationTree> found, List<? extends AnnotationTree> annotations) {
    for (AnnotationTree annotation : annotations) {
      if (Support.isAnnotation(annotation, BODY)) {
        found.add(annotation);
      }
    }
  }
}
