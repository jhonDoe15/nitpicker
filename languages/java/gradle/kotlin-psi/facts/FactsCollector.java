package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.bodies.Bodies;
import nitpicker.kotlinpsi.common.Frame;
import nitpicker.kotlinpsi.load.LoadCalls;
import nitpicker.kotlinpsi.timeouts.Timeouts;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class FactsCollector {
  private static final String HANDLER = "org.springframework.web.bind.annotation.ExceptionHandler";

  private final KtFile file;
  private final State state;
  private final Declarations declarations;
  private final Calls calls;
  private final Timeouts timeouts;
  private final Predicates predicates;
  private final Bodies bodies;
  private final LoadCalls loads;

  public FactsCollector(KtFile file, String text, String relative, boolean test, Set<String> nothing) {
    this.file = file;
    this.state = new State(file, text, relative, test);
    this.declarations = new Declarations(state);
    this.calls = new Calls(state);
    this.timeouts = new Timeouts(file, text, state.timeouts);
    this.predicates = new Predicates(state);
    this.bodies = new Bodies(text, test, nothing, state.namesOf(HANDLER));
    this.loads = test ? null : new LoadCalls(file, state::lineOf);
  }

  public void collect() {
    walk(file, null);
  }

  public Map<String, Object> result() {
    Map<String, Object> result = new LinkedHashMap<>(state.result());
    result.putAll(bodies.result());
    if (loads != null) {
      result.putAll(loads.result());
    }
    return result;
  }

  private void walk(PsiElement element, Frame frame) {
    if (element instanceof KtEnumEntry
        || (element instanceof KtObjectDeclaration && ((KtObjectDeclaration) element).isObjectLiteral())) {
      descend(element, declarations.literal((KtClassOrObject) element, frame));
    } else if (element instanceof KtClassOrObject) {
      descend(element, declarations.declareClass((KtClassOrObject) element, frame));
    } else {
      descend(element, enter(element, frame));
    }
  }

  private void descend(PsiElement element, Frame inner) {
    for (PsiElement child : element.getChildren()) {
      walk(child, inner);
    }
  }

  private Frame enter(PsiElement element, Frame frame) {
    if (element instanceof KtNamedFunction) {
      Frame inner = declarations.declareFunction((KtNamedFunction) element, frame);
      bodies.function(inner, (KtNamedFunction) element);
      return inner;
    }
    if (element instanceof KtSecondaryConstructor) {
      return declarations.declareConstructor((KtSecondaryConstructor) element, frame);
    }
    if (element instanceof KtPropertyAccessor) {
      return new Frame(frame, m("k", "fun", "name", accessorName((KtPropertyAccessor) element)));
    }
    if (element instanceof KtClassInitializer) {
      return new Frame(frame, m("k", "init"));
    }
    if (element instanceof KtLambdaExpression) {
      Frame inner = new Frame(frame, Scopes.lambdaData((KtLambdaExpression) element, state));
      bodies.iterable(inner, element);
      return inner;
    }
    if (element instanceof KtLoopExpression) {
      Frame inner = new Frame(frame, Scopes.loopData((KtLoopExpression) element, state));
      bodies.iterable(inner, element);
      return inner;
    }
    observe(element, frame);
    return frame;
  }

  private String accessorName(KtPropertyAccessor accessor) {
    String property = accessor.getProperty().getName();
    if (accessor.isGetter()) {
      return property == null ? "get" : property;
    }
    return property == null ? "set" : property + ".set";
  }

  private void observe(PsiElement element, Frame frame) {
    bodies.observe(element, frame);
    if (loads != null) {
      loads.observe(element);
    }
    if (element instanceof KtProperty) {
      declarations.declareProperty((KtProperty) element, frame);
    } else if (element instanceof KtTypeAlias) {
      declarations.declareTypeAlias((KtTypeAlias) element);
    } else if (element instanceof KtCallExpression) {
      calls.call((KtCallExpression) element, frame);
      timeouts.call((KtCallExpression) element, frame);
    } else if (element instanceof KtSuperTypeCallEntry) {
      KtSuperTypeCallEntry entry = (KtSuperTypeCallEntry) element;
      calls.delegation(element, nameOf(entry.getCalleeExpression()), entry.getValueArguments(), List.of());
    } else if (element instanceof KtConstructorDelegationCall) {
      calls.constructorDelegation((KtConstructorDelegationCall) element, frame);
    } else if (element instanceof KtBinaryExpression) {
      predicates.binary((KtBinaryExpression) element, frame);
    } else if (element instanceof KtDotQualifiedExpression) {
      predicates.containsForm((KtDotQualifiedExpression) element, frame);
    } else if (element instanceof KtCallableReferenceExpression) {
      state.references.add(((KtCallableReferenceExpression) element).getCallableReference().getReferencedName());
    }
  }
}
