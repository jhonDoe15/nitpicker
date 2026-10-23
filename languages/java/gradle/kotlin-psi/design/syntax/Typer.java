package nitpicker.kotlinpsi.design.syntax;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.resolve.Bindings;
import nitpicker.kotlinpsi.design.resolve.CallResolver;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Typer {
  private static final Set<String> RECEIVER_RETURNING = Set.of("also", "apply", "takeIf", "takeUnless", "onEach");

  private static final Set<String> VALUE_LAMBDAS = Set.of("use", "let", "also", "takeIf", "takeUnless");

  private final Ctx ctx;
  private final Map<PsiElement, Ty> memo = new IdentityHashMap<>();
  private final Set<PsiElement> active = new HashSet<>();

  public Typer(Ctx ctx) {
    this.ctx = ctx;
  }

  public Ty typeOf(KtExpression expression) {
    KtExpression e = Ps.parens(expression);
    if (e == null) {
      return Ty.UNKNOWN;
    }
    Ty known = memo.get(e);
    if (known != null) {
      return known;
    }
    if (!active.add(e)) {
      return Ty.UNKNOWN;
    }
    try {
      Ty type = compute(e);
      memo.put(e, type);
      return type;
    } finally {
      active.remove(e);
    }
  }

  private Ty compute(KtExpression e) {
    if (e instanceof KtConstantExpression) {
      return Ty.ofConstant((KtConstantExpression) e);
    }
    if (e instanceof KtStringTemplateExpression) {
      return Ty.text("String");
    }
    if (e instanceof KtPostfixExpression && ((KtPostfixExpression) e).getOperationToken() == KtTokens.EXCLEXCL) {
      return typeOf(((KtPostfixExpression) e).getBaseExpression());
    }
    if (e instanceof KtBinaryExpressionWithTypeRHS) {
      return ctx.names.resolve(((KtBinaryExpressionWithTypeRHS) e).getRight(), ctx.sourceOf(e));
    }
    if (e instanceof KtBinaryExpression && ((KtBinaryExpression) e).getOperationToken() == KtTokens.ELVIS) {
      Ty left = typeOf(((KtBinaryExpression) e).getLeft());
      return left.known() ? left : typeOf(((KtBinaryExpression) e).getRight());
    }
    if (e instanceof KtThisExpression) {
      return thisType((KtThisExpression) e);
    }
    if (e instanceof KtNameReferenceExpression) {
      return nameType((KtNameReferenceExpression) e);
    }
    if (e instanceof KtQualifiedExpression) {
      return qualifiedType((KtQualifiedExpression) e);
    }
    if (e instanceof KtCallExpression) {
      return callType((KtCallExpression) e);
    }
    return Ty.UNKNOWN;
  }

  private Ty thisType(KtThisExpression e) {
    String label = e.getLabelName();
    for (Bindings.Level level : ctx.bindings.levels(e)) {
      if (level.blurred) {
        return Ty.UNKNOWN;
      }
      Ty found = thisAt(level, label, e);
      if (found != null) {
        return found;
      }
    }
    return Ty.UNKNOWN;
  }

  private Ty thisAt(Bindings.Level level, String label, KtThisExpression e) {
    if (level.extension != null) {
      boolean named = label == null || label.equals(level.extension.getName());
      return named ? ctx.names.resolve(level.extension.getReceiverTypeReference(), ctx.sourceOf(e)) : null;
    }
    if (label != null && !label.equals(level.owner.name)) {
      return null;
    }
    return level.instance || label != null ? Ty.of(level.owner) : Ty.UNKNOWN;
  }

  private Ty nameType(KtNameReferenceExpression ref) {
    Binding binding = ctx.bindings.bind(ref);
    switch (binding.kind) {
      case LOCAL:
        return localType(binding.declaration);
      case FIELD:
        return propType(binding.prop);
      case TYPE:
        Owner holder = objectOwner(binding.owner);
        return holder == null ? Ty.UNKNOWN : Ty.of(holder);
      default:
        return Ty.UNKNOWN;
    }
  }

  public Ty localType(PsiElement declaration) {
    Ty known = memo.get(declaration);
    if (known != null) {
      return known;
    }
    if (!active.add(declaration)) {
      return Ty.UNKNOWN;
    }
    try {
      Ty type = Ty.UNKNOWN;
      if (declaration instanceof KtProperty) {
        KtProperty property = (KtProperty) declaration;
        type = property.getTypeReference() != null
            ? ctx.names.resolve(property.getTypeReference(), ctx.sourceOf(property))
            : property.hasDelegate() ? Ty.UNKNOWN : typeOf(property.getInitializer());
      } else if (declaration instanceof KtParameter) {
        KtParameter parameter = (KtParameter) declaration;
        type = parameter.getTypeReference() != null
            ? ctx.names.resolve(parameter.getTypeReference(), ctx.sourceOf(declaration))
            : lambdaValue(parameter.getParent() == null ? null : parameter.getParent().getParent(), parameter);
      } else if (declaration instanceof KtFunctionLiteral) {
        type = lambdaValue(declaration, null);
      }
      memo.put(declaration, type);
      return type;
    } finally {
      active.remove(declaration);
    }
  }

  private Ty lambdaValue(PsiElement literal, KtParameter parameter) {
    KtExpression receiver = valueReceiver(literal, parameter);
    return receiver == null ? Ty.UNKNOWN : typeOf(receiver);
  }

  public KtExpression valueReceiver(PsiElement literal, KtParameter parameter) {
    if (!(literal instanceof KtFunctionLiteral) || !(literal.getParent() instanceof KtLambdaExpression)) {
      return null;
    }
    KtFunctionLiteral function = (KtFunctionLiteral) literal;
    if (function.getValueParameters().size() > 1
        || parameter != null && function.getValueParameters().get(0) != parameter) {
      return null;
    }
    KtCallExpression host = ctx.lambdas.host((KtLambdaExpression) literal.getParent());
    String name = host == null ? null : Ps.name(host);
    return name != null && VALUE_LAMBDAS.contains(name) ? Ps.receiverOf(host) : null;
  }

  public Ty propType(Prop prop) {
    Ty known = memo.get(prop.psi);
    if (known != null) {
      return known;
    }
    if (!active.add(prop.psi)) {
      return Ty.UNKNOWN;
    }
    try {
      Ty type = prop.type != null ? ctx.names.resolve(prop.type, prop.owner.source)
          : prop.delegated ? Ty.UNKNOWN : typeOf(prop.init);
      memo.put(prop.psi, type);
      return type;
    } finally {
      active.remove(prop.psi);
    }
  }

  public Ty returnType(Fun function) {
    if (function.constructor()) {
      return Ty.of(function.owner);
    }
    if (function.returns != null) {
      return ctx.names.resolve(function.returns, function.owner.source);
    }
    if (function.property != null) {
      return propType(function.property);
    }
    if (function.psi instanceof KtNamedFunction && !((KtNamedFunction) function.psi).hasBlockBody()) {
      return typeOf(((KtNamedFunction) function.psi).getBodyExpression());
    }
    return Ty.UNKNOWN;
  }

  private Ty qualifiedType(KtQualifiedExpression q) {
    KtExpression selector = q.getSelectorExpression();
    if (selector instanceof KtCallExpression) {
      return callType((KtCallExpression) selector);
    }
    if (!(selector instanceof KtNameReferenceExpression)) {
      return Ty.UNKNOWN;
    }
    String name = ((KtNameReferenceExpression) selector).getReferencedName();
    Owner staticOwner = staticOwner(q.getReceiverExpression());
    if (staticOwner != null) {
      return staticMember(staticOwner, name);
    }
    Ty receiver = typeOf(q.getReceiverExpression());
    Prop prop = receiver.project() ? ctx.members.prop(receiver.owner, name) : null;
    return prop == null ? Ty.UNKNOWN : propType(prop);
  }

  private Ty staticMember(Owner owner, String name) {
    Owner nested = owner.nested.get(name);
    if (nested != null) {
      Owner holder = objectOwner(nested);
      return holder == null ? Ty.UNKNOWN : Ty.of(holder);
    }
    if (owner.cases.contains(name)) {
      return Ty.of(owner);
    }
    Owner holder = objectOwner(owner);
    Prop prop = holder == null ? null : ctx.members.prop(holder, name);
    return prop == null ? Ty.UNKNOWN : propType(prop);
  }

  private Ty callType(KtCallExpression call) {
    CallResolver.Resolved resolved = ctx.calls.resolve(call);
    if (resolved.constructed != null) {
      return Ty.of(resolved.constructed);
    }
    if (resolved.target != null) {
      return returnType(resolved.target);
    }
    KtExpression receiver = Ps.receiverOf(call);
    String name = Ps.name(call);
    return receiver != null && RECEIVER_RETURNING.contains(name) ? typeOf(receiver) : Ty.UNKNOWN;
  }

  public Owner objectOwner(Owner owner) {
    if (owner.psi instanceof KtObjectDeclaration) {
      return owner;
    }
    return owner.companion;
  }

  public boolean constructible(Owner owner) {
    return owner.psi instanceof KtClass && !((KtClass) owner.psi).isInterface() && !((KtClass) owner.psi).isEnum()
        && !((KtClass) owner.psi).isAnnotation();
  }

  public Owner staticOwner(KtExpression expression) {
    KtExpression e = Ps.parens(expression);
    if (e instanceof KtNameReferenceExpression) {
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
      return binding.kind == Binding.Kind.TYPE ? binding.owner : null;
    }
    if (!(e instanceof KtDotQualifiedExpression)) {
      return null;
    }
    List<String> parts = new ArrayList<>();
    KtExpression current = e;
    while (current instanceof KtDotQualifiedExpression) {
      KtExpression selector = ((KtDotQualifiedExpression) current).getSelectorExpression();
      if (!(selector instanceof KtNameReferenceExpression)) {
        return null;
      }
      parts.add(0, ((KtNameReferenceExpression) selector).getReferencedName());
      current = Ps.parens(((KtDotQualifiedExpression) current).getReceiverExpression());
    }
    if (!(current instanceof KtNameReferenceExpression)) {
      return null;
    }
    parts.add(0, ((KtNameReferenceExpression) current).getReferencedName());
    Binding first = ctx.bindings.bind((KtNameReferenceExpression) current);
    if (first.kind == Binding.Kind.LOCAL || first.kind == Binding.Kind.FIELD) {
      return null;
    }
    return ctx.names.chain(parts, e, ctx.sourceOf(e));
  }
}
