package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.List;
import java.util.Map;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class FactsCollector {
  private final KtFile file;
  private final State state;
  private final Declarations declarations;
  private final Calls calls;
  private final Predicates predicates;

  public FactsCollector(KtFile file, String text, String relative, boolean test) {
    this.file = file;
    this.state = new State(file, text, relative, test);
    this.declarations = new Declarations(state);
    this.calls = new Calls(state);
    this.predicates = new Predicates(state);
  }

  public void collect() {
    walk(file, null);
  }

  public Map<String, Object> result() {
    return state.result();
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
      return declarations.declareFunction((KtNamedFunction) element, frame);
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
      return new Frame(frame, Scopes.lambdaData((KtLambdaExpression) element));
    }
    if (element instanceof KtLoopExpression) {
      return new Frame(frame, Scopes.loopData((KtLoopExpression) element));
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
    if (element instanceof KtProperty) {
      declarations.declareProperty((KtProperty) element, frame);
    } else if (element instanceof KtTypeAlias) {
      declarations.declareTypeAlias((KtTypeAlias) element);
    } else if (element instanceof KtCallExpression) {
      calls.call((KtCallExpression) element, frame);
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
