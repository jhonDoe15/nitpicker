package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

final class Bindings {
  private static final Set<String> ENUM_MEMBERS = Set.of("name", "ordinal");

  private final Ctx ctx;

  Bindings(Ctx ctx) {
    this.ctx = ctx;
  }

  Binding bind(KtSimpleNameExpression ref) {
    String name = ref.getReferencedName();
    Source source = sourceOf(ref);
    boolean blurred = false;
    boolean instance = true;
    boolean first = true;
    boolean inFunction = false;
    PsiElement child = ref;
    for (PsiElement p = ref.getParent(); p != null; child = p, p = p.getParent()) {
      PsiElement declared = declared(p, child, name, ref, inFunction);
      if (declared != null) {
        return Binding.local(declared);
      }
      if (p instanceof KtLambdaExpression) {
        blurred |= ctx.lambdas.receiver((KtLambdaExpression) p);
      } else if (p instanceof KtObjectLiteralExpression) {
        blurred = true;
      } else if (p instanceof KtPropertyAccessor && "field".equals(name)) {
        return accessorField((KtPropertyAccessor) p, blurred);
      } else if (p instanceof KtNamedFunction || p instanceof KtPropertyAccessor || p instanceof KtSecondaryConstructor) {
        inFunction = true;
        Binding receiver = p instanceof KtNamedFunction ? extension((KtNamedFunction) p, name, source, blurred) : null;
        if (receiver != null) {
          return receiver;
        }
      } else if (p instanceof KtClassOrObject) {
        Owner owner = ctx.index.byPsi.get(p);
        if (owner == null) {
          blurred = true;
          continue;
        }
        Binding found = member(owner, name, instance, first && instance, blurred);
        if (found != null) {
          return found;
        }
        instance = instance && p instanceof KtClass && ((KtClass) p).isInner();
        first = false;
      }
    }
    return blurred ? Binding.UNKNOWN : topLevel(name, ref, source);
  }

  static final class Level {
    final Owner owner;
    final KtNamedFunction extension;
    final boolean instance;
    final boolean thisLevel;
    final boolean blurred;

    Level(Owner owner, KtNamedFunction extension, boolean instance, boolean thisLevel, boolean blurred) {
      this.owner = owner;
      this.extension = extension;
      this.instance = instance;
      this.thisLevel = thisLevel;
      this.blurred = blurred;
    }
  }

  List<Level> levels(PsiElement at) {
    List<Level> levels = new ArrayList<>();
    boolean blurred = false;
    boolean instance = true;
    boolean first = true;
    for (PsiElement p = at.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtLambdaExpression) {
        blurred |= ctx.lambdas.receiver((KtLambdaExpression) p);
      } else if (p instanceof KtObjectLiteralExpression) {
        blurred = true;
      } else if (p instanceof KtNamedFunction && ((KtNamedFunction) p).getReceiverTypeReference() != null) {
        levels.add(new Level(null, (KtNamedFunction) p, false, false, blurred));
      } else if (p instanceof KtClassOrObject) {
        Owner owner = ctx.index.byPsi.get(p);
        if (owner == null) {
          blurred = true;
          continue;
        }
        levels.add(new Level(owner, null, instance, first && instance, blurred));
        instance = instance && p instanceof KtClass && ((KtClass) p).isInner();
        first = false;
      }
    }
    return levels;
  }

  private Binding accessorField(KtPropertyAccessor accessor, boolean blurred) {
    KtProperty property = accessor.getProperty();
    Owner owner = ctx.index.byPsi.get(PsiTreeUtil.getParentOfType(property, KtClassOrObject.class, true));
    Prop prop = owner == null ? null : owner.props.get(property.getName());
    return prop == null || blurred ? Binding.UNKNOWN : Binding.field(prop, true);
  }

  private Binding extension(KtNamedFunction function, String name, Source source, boolean blurred) {
    if (function.getReceiverTypeReference() == null) {
      return null;
    }
    Ty receiver = ctx.names.resolve(function.getReceiverTypeReference(), source);
    if (!receiver.project()) {
      return Binding.UNKNOWN;
    }
    Prop prop = ctx.members.prop(receiver.owner, name);
    if (prop != null) {
      return blurred ? Binding.UNKNOWN : Binding.receiverField(prop);
    }
    return ctx.hierarchy.external(receiver.owner) ? Binding.UNKNOWN : null;
  }

  private Binding member(Owner owner, String name, boolean instance, boolean thisLevel, boolean blurred) {
    Prop prop = instance || owner.psi instanceof KtObjectDeclaration ? ctx.members.prop(owner, name) : null;
    if (prop != null) {
      return blurred ? Binding.UNKNOWN : Binding.field(prop, thisLevel);
    }
    if (owner.companion != null) {
      Prop companion = ctx.members.prop(owner.companion, name);
      if (companion != null) {
        return blurred ? Binding.UNKNOWN : Binding.field(companion, false);
      }
    }
    boolean enumClass = owner.psi instanceof KtClass && ((KtClass) owner.psi).isEnum();
    if (instance && (ctx.hierarchy.external(owner) || enumClass && ENUM_MEMBERS.contains(name))) {
      return Binding.UNKNOWN;
    }
    return null;
  }

  private Binding topLevel(String name, PsiElement at, Source source) {
    String imported = source.imports.get(name);
    if (imported != null) {
      int dot = imported.lastIndexOf('.');
      Binding found = single(ctx.index.topProps(dot < 0 ? "" : imported.substring(0, dot), imported.substring(dot + 1)), source);
      return found != null ? found : typeBinding(name, at, source);
    }
    Binding same = single(ctx.index.topProps(source.pkg, name), source);
    if (same != null) {
      return same;
    }
    Binding star = null;
    for (String prefix : source.stars) {
      Binding candidate = single(ctx.index.topProps(prefix, name), source);
      if (candidate != null && star != null) {
        return Binding.UNKNOWN;
      }
      star = candidate != null ? candidate : star;
    }
    return star != null ? star : typeBinding(name, at, source);
  }

  private Binding single(List<Prop> props, Source source) {
    Prop found = null;
    for (Prop prop : props) {
      if (prop.isPrivate && prop.owner.source != source) {
        continue;
      }
      if (found != null) {
        return Binding.UNKNOWN;
      }
      found = prop;
    }
    return found == null ? null : Binding.field(found, false);
  }

  private Binding typeBinding(String name, PsiElement at, Source source) {
    Owner type = ctx.names.lookup(name, at, source);
    return type == null ? Binding.UNKNOWN : Binding.type(type);
  }

  private PsiElement declared(PsiElement p, PsiElement child, String name, PsiElement ref, boolean inFunction) {
    if (p instanceof KtBlockExpression) {
      return inBlock((KtBlockExpression) p, name, ref);
    }
    if (p instanceof KtFunctionLiteral) {
      return lambdaParameter((KtFunctionLiteral) p, name);
    }
    if (p instanceof KtNamedFunction) {
      return parameter(((KtNamedFunction) p).getValueParameters(), name);
    }
    if (p instanceof KtSecondaryConstructor) {
      return parameter(((KtSecondaryConstructor) p).getValueParameters(), name);
    }
    if (p instanceof KtForExpression) {
      return loopVariable((KtForExpression) p, name, ref);
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
      return parameter(((KtClassOrObject) p).getPrimaryConstructorParameters(), name);
    }
    return null;
  }

  private PsiElement inBlock(KtBlockExpression block, String name, PsiElement ref) {
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
        found = entry(((KtDestructuringDeclaration) statement).getEntries(), name, found);
      }
    }
    return found;
  }

  private PsiElement lambdaParameter(KtFunctionLiteral literal, String name) {
    List<KtParameter> parameters = literal.getValueParameters();
    if (parameters.isEmpty()) {
      return "it".equals(name) ? literal : null;
    }
    for (KtParameter parameter : parameters) {
      if (name.equals(parameter.getName())) {
        return parameter;
      }
      if (parameter.getDestructuringDeclaration() != null) {
        PsiElement hit = entry(parameter.getDestructuringDeclaration().getEntries(), name, null);
        if (hit != null) {
          return hit;
        }
      }
    }
    return null;
  }

  private PsiElement loopVariable(KtForExpression loop, String name, PsiElement ref) {
    if (!PsiTreeUtil.isAncestor(loop.getBody(), ref, false)) {
      return null;
    }
    KtParameter variable = loop.getLoopParameter();
    if (variable != null && name.equals(variable.getName())) {
      return variable;
    }
    return loop.getDestructuringDeclaration() == null ? null
        : entry(loop.getDestructuringDeclaration().getEntries(), name, null);
  }

  private PsiElement parameter(List<KtParameter> parameters, String name) {
    for (KtParameter parameter : parameters) {
      if (name.equals(parameter.getName()) && !parameter.hasValOrVar()) {
        return parameter;
      }
    }
    return null;
  }

  private PsiElement entry(List<KtDestructuringDeclarationEntry> entries, String name, PsiElement fallback) {
    for (KtDestructuringDeclarationEntry entry : entries) {
      if (name.equals(entry.getName())) {
        return entry;
      }
    }
    return fallback;
  }

  private Source sourceOf(PsiElement element) {
    return ctx.sourceOf(element);
  }
}
