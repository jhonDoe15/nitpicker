package nitpicker.kotlinpsi.design.resolve;

import java.util.List;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

/** Finds the local declaration (parameter, local variable, loop or catch variable) a name refers to. */
public final class Declared {
  private final String name;
  private final PsiElement ref;

  public Declared(String name, PsiElement ref) {
    this.name = name;
    this.ref = ref;
  }

  public PsiElement at(PsiElement p, PsiElement child, boolean inFunction) {
    if (p instanceof KtBlockExpression) {
      return inBlock((KtBlockExpression) p);
    }
    if (p instanceof KtFunctionLiteral) {
      return lambdaParameter((KtFunctionLiteral) p);
    }
    if (p instanceof KtNamedFunction) {
      return parameter(((KtNamedFunction) p).getValueParameters());
    }
    if (p instanceof KtSecondaryConstructor) {
      return parameter(((KtSecondaryConstructor) p).getValueParameters());
    }
    if (p instanceof KtForExpression) {
      return loopVariable((KtForExpression) p);
    }
    if (p instanceof KtCatchClause) {
      KtParameter caught = ((KtCatchClause) p).getCatchParameter();
      return caught != null && name.equals(caught.getName()) ? caught : null;
    }
    if (p instanceof KtWhenExpression) {
      KtProperty subject = ((KtWhenExpression) p).getSubjectVariable();
      return subject != null && name.equals(subject.getName()) && child != subject ? subject : null;
    }
    if (p instanceof KtPropertyAccessor) {
      KtParameter value = ((KtPropertyAccessor) p).getParameter();
      return value != null && name.equals(value.getName()) ? value : null;
    }
    if (p instanceof KtClassOrObject && !inFunction) {
      return parameter(((KtClassOrObject) p).getPrimaryConstructorParameters());
    }
    return null;
  }

  private PsiElement inBlock(KtBlockExpression block) {
    PsiElement found = null;
    for (KtExpression statement : block.getStatements()) {
      if (statement.getTextOffset() >= ref.getTextOffset()) {
        break;
      }
      if (PsiTreeUtil.isAncestor(statement, ref, false)) {
        continue;
      }
      if (statement instanceof KtProperty && name.equals(((KtProperty) statement).getName())) {
        found = statement;
      } else if (statement instanceof KtDestructuringDeclaration) {
        found = entry(((KtDestructuringDeclaration) statement).getEntries(), found);
      }
    }
    return found;
  }

  private PsiElement lambdaParameter(KtFunctionLiteral literal) {
    List<KtParameter> parameters = literal.getValueParameters();
    if (parameters.isEmpty()) {
      return "it".equals(name) ? literal : null;
    }
    for (KtParameter parameter : parameters) {
      PsiElement hit = name.equals(parameter.getName()) ? parameter : destructured(parameter);
      if (hit != null) {
        return hit;
      }
    }
    return null;
  }

  private PsiElement destructured(KtParameter parameter) {
    KtDestructuringDeclaration declaration = parameter.getDestructuringDeclaration();
    return declaration == null ? null : entry(declaration.getEntries(), null);
  }

  private PsiElement loopVariable(KtForExpression loop) {
    if (!PsiTreeUtil.isAncestor(loop.getBody(), ref, false)) {
      return null;
    }
    KtParameter variable = loop.getLoopParameter();
    if (variable != null && name.equals(variable.getName())) {
      return variable;
    }
    return loop.getDestructuringDeclaration() == null ? null
        : entry(loop.getDestructuringDeclaration().getEntries(), null);
  }

  private PsiElement parameter(List<KtParameter> parameters) {
    for (KtParameter parameter : parameters) {
      if (name.equals(parameter.getName()) && !parameter.hasValOrVar()) {
        return parameter;
      }
    }
    return null;
  }

  private PsiElement entry(List<KtDestructuringDeclarationEntry> entries, PsiElement fallback) {
    for (KtDestructuringDeclarationEntry entry : entries) {
      if (name.equals(entry.getName())) {
        return entry;
      }
    }
    return fallback;
  }
}
