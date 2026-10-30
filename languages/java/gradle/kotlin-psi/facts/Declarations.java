package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import nitpicker.kotlinpsi.bodies.Initializers;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Declarations {
  private final State state;

  Declarations(State state) {
    this.state = state;
  }

  private List<Object> supertypes(KtClassOrObject klass) {
    List<Object> supers = new ArrayList<>();
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      if (entry.getTypeReference() != null) {
        supers.add(withoutTypeArguments(entry.getTypeReference().getText()).trim());
      }
    }
    return supers;
  }

  Frame literal(KtClassOrObject declaration, Frame frame) {
    return new Frame(frame, m("k", "object", "supers", supertypes(declaration)));
  }

  private String visibility(KtModifierListOwner owner) {
    if (owner.hasModifier(KtTokens.PRIVATE_KEYWORD)) {
      return "private";
    }
    return owner.hasModifier(KtTokens.INTERNAL_KEYWORD) ? "internal" : "public";
  }

  private String effective(String own, Frame frame) {
    String result = own;
    for (Frame f = frame; f != null; f = f.parent) {
      if ("class".equals(f.kind())) {
        String outer = (String) f.data.get("visibility");
        result = "private".equals(outer) || "private".equals(result) ? "private"
            : "internal".equals(outer) || "internal".equals(result) ? "internal" : "public";
      }
    }
    return result;
  }

  Frame declareClass(KtClassOrObject klass, Frame frame) {
    Frame owner = frame == null ? null : frame.nearest("class");
    String simple = klass.getName() == null ? "<anonymous>" : klass.getName();
    boolean companion = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion();
    if (companion && klass.getName() == null) {
      simple = "Companion";
    }
    String qualified = owner == null ? simple : owner.data.get("qualified") + "." + simple;
    String kind = klass instanceof KtObjectDeclaration
        ? (((KtObjectDeclaration) klass).isCompanion() ? "companion" : "object")
        : ((KtClass) klass).isInterface() ? "interface" : ((KtClass) klass).isEnum() ? "enum" : "class";
    boolean local = klass.isLocal();
    List<Object> constructor = new ArrayList<>();
    for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
      constructor.add(parameter(parameter));
    }
    List<Object> entries = new ArrayList<>();
    for (KtDeclaration member : klass.getDeclarations()) {
      if (member instanceof KtEnumEntry) {
        entries.add(member.getName());
      }
    }
    boolean superCall = klass.getSuperTypeListEntries().stream().anyMatch(e -> e instanceof KtSuperTypeCallEntry);
    String own = visibility(klass);
    KtPrimaryConstructor primary = klass.getPrimaryConstructor();
    state.classes.add(
        m(
            "name", simple, "qualified", qualified, "kind", kind, "line", state.lineOf(klass.getTextOffset()),
            "data", klass instanceof KtClass && ((KtClass) klass).isData(),
            "open", klass.hasModifier(KtTokens.OPEN_KEYWORD) || klass.hasModifier(KtTokens.ABSTRACT_KEYWORD)
                || klass.hasModifier(KtTokens.SEALED_KEYWORD),
            "local", local, "visibility", effective(own, frame),
            "constructorVisibility", primary == null ? "public" : visibility(primary),
            "annotations", annotationTexts(klass), "supers", supertypes(klass), "superCall", superCall,
            "primaryParameters", constructor, "entries", entries, "superClass", superClass(klass),
            "constructorAnnotations", primary == null ? null : annotationEntries(primary),
            "genericSupers", genericSupers(klass)));
    return new Frame(frame, m("k", "class", "name", simple, "qualified", qualified,
        "supers", supertypes(klass), "visibility", own));
  }

  private static List<Object> genericSupers(KtClassOrObject klass) {
    List<Object> texts = new ArrayList<>();
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      if (entry.getTypeReference() != null && entry.getTypeReference().getText().contains("<")) {
        texts.add(entry.getTypeReference().getText());
      }
    }
    return texts.isEmpty() ? null : texts;
  }

  private static String superClass(KtClassOrObject klass) {
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      if (entry instanceof KtSuperTypeCallEntry && entry.getTypeReference() != null) {
        return withoutTypeArguments(entry.getTypeReference().getText()).trim();
      }
    }
    return null;
  }

  private Map<String, Object> parameter(KtParameter parameter) {
    return m(
        "name", parameter.getName(), "type", clip(parameter.getTypeReference()),
        "vararg", parameter.isVarArg(), "default", parameter.hasDefaultValue(),
        "defaultValue", clip(parameter.getDefaultValue()),
        "property", parameter.hasValOrVar() ? (parameter.isMutable() ? "var" : "val") : null,
        "line", state.lineOf(parameter.getTextOffset()), "annotations", annotationNames(parameter),
        "annotationEntries", annotationEntries(parameter));
  }

  private List<Object> modifiers(KtModifierListOwner owner) {
    List<Object> names = new ArrayList<>();
    for (var token : List.of(KtTokens.OVERRIDE_KEYWORD, KtTokens.OPEN_KEYWORD, KtTokens.ABSTRACT_KEYWORD,
        KtTokens.INFIX_KEYWORD, KtTokens.OPERATOR_KEYWORD, KtTokens.INLINE_KEYWORD, KtTokens.SUSPEND_KEYWORD,
        KtTokens.ACTUAL_KEYWORD, KtTokens.EXPECT_KEYWORD, KtTokens.LATEINIT_KEYWORD, KtTokens.FINAL_KEYWORD,
        KtTokens.PROTECTED_KEYWORD)) {
      if (owner.hasModifier(token)) {
        names.add(token.getValue());
      }
    }
    return names;
  }

  Frame declareFunction(KtNamedFunction function, Frame frame) {
    Frame holder = frame;
    while (holder != null && !"class".equals(holder.kind()) && !"object".equals(holder.kind())) {
      holder = holder.parent;
    }
    boolean anonymous = holder != null && "object".equals(holder.kind());
    Frame owner = frame == null ? null : frame.nearest("class");
    List<Object> parameters = new ArrayList<>();
    for (KtParameter parameter : function.getValueParameters()) {
      parameters.add(parameter(parameter));
    }
    KtExpression body = function.getBodyExpression();
    boolean local = function.isLocal();
    state.functions.add(
        m(
            "name", function.getName(), "line", state.lineOf(function.getTextOffset()),
            "owner", anonymous ? "<anonymous>" : owner == null ? "" : owner.data.get("qualified"),
            "local", local, "visibility", local ? "private" : effective(visibility(function), frame),
            "modifiers", modifiers(function), "annotations", annotationNames(function),
            "annotationEntries", annotationEntries(function), "typeParameters", !function.getTypeParameters().isEmpty(),
            "receiver", clip(function.getReceiverTypeReference()),
            "returnType", clip(function.getTypeReference()), "parameters", parameters,
            "hasBody", body != null,
            "emptyBody", body instanceof KtBlockExpression && ((KtBlockExpression) body).getStatements().isEmpty(),
            "expressionBody", body != null && !(body instanceof KtBlockExpression) ? Boolean.TRUE : null,
            "returns", body instanceof KtNameReferenceExpression ? nameOf(body) : null,
            "forward", forward(function)));
    return new Frame(frame, m("k", "fun", "name", function.getName()));
  }

  Frame declareConstructor(KtSecondaryConstructor constructor, Frame frame) {
    Frame owner = frame == null ? null : frame.nearest("class");
    List<Object> parameters = new ArrayList<>();
    for (KtParameter parameter : constructor.getValueParameters()) {
      parameters.add(parameter(parameter));
    }
    state.functions.add(
        m(
            "name", "<init>", "line", state.lineOf(constructor.getTextOffset()),
            "owner", owner == null ? "" : owner.data.get("qualified"), "local", false,
            "visibility", effective(visibility(constructor), frame), "modifiers", List.of(),
            "annotations", annotationNames(constructor), "annotationEntries", annotationEntries(constructor),
            "typeParameters", false, "receiver", null,
            "returnType", null, "parameters", parameters, "hasBody", true, "emptyBody", false, "forward", null));
    return new Frame(frame, m("k", "fun", "name", "<init>"));
  }

  void declareProperty(KtProperty property, Frame frame) {
    Frame owner = frame == null ? null : frame.nearest("class");
    boolean member = owner != null && frame == owner;
    if (property.isTopLevel() && property.getName() != null) {
      state.globals.add(
          m(
              "name", property.getName(), "line", state.lineOf(property.getTextOffset()),
              "type", clip(property.getTypeReference()), "initializer", Initializers.callee(property)));
    }
    if (!member || property.getName() == null) {
      return;
    }
    state.properties.add(
        m(
            "name", property.getName(), "line", state.lineOf(property.getTextOffset()),
            "owner", owner.data.get("qualified"), "type", clip(property.getTypeReference()),
            "var", property.isVar(), "lateinit", property.hasModifier(KtTokens.LATEINIT_KEYWORD),
            "delegated", property.getDelegate() != null, "computed", computed(property),
            "annotations", annotationNames(property),
            "annotationEntries", annotationEntries(property), "initializer", Initializers.callee(property),
            "literal", Initializers.literal(property)));
  }

  private static Boolean computed(KtProperty property) {
    KtPropertyAccessor getter = property.getGetter();
    if (property.hasInitializer() || property.hasDelegate() || getter == null || !getter.hasBody()) {
      return null;
    }
    for (KtPropertyAccessor accessor : property.getAccessors()) {
      for (KtNameReferenceExpression name
          : PsiTreeUtil.collectElementsOfType(accessor, KtNameReferenceExpression.class)) {
        if ("field".equals(name.getReferencedName())) {
          return null;
        }
      }
    }
    return Boolean.TRUE;
  }

  void declareTypeAlias(KtTypeAlias alias) {
    if (alias.getName() != null && alias.getTypeReference() != null) {
      state.typeAliases.add(
          m("name", alias.getName(), "target", clip(withoutTypeArguments(alias.getTypeReference().getText()), 200)));
    }
  }

  private Object forward(KtNamedFunction function) {
    KtExpression body = function.getBodyExpression();
    KtExpression expression = null;
    if (body instanceof KtBlockExpression) {
      List<KtExpression> statements = ((KtBlockExpression) body).getStatements();
      if (statements.size() == 1) {
        KtExpression only = statements.get(0);
        expression = only instanceof KtReturnExpression ? ((KtReturnExpression) only).getReturnedExpression() : only;
      }
    } else {
      expression = body;
    }
    if (expression == null) {
      return null;
    }
    expression = KtPsiUtil.safeDeparenthesize(expression);
    KtExpression receiver = null;
    if (expression instanceof KtDotQualifiedExpression) {
      receiver = ((KtDotQualifiedExpression) expression).getReceiverExpression();
      expression = ((KtDotQualifiedExpression) expression).getSelectorExpression();
    }
    if (!(expression instanceof KtCallExpression)) {
      return null;
    }
    KtCallExpression call = (KtCallExpression) expression;
    String name = nameOf(call.getCalleeExpression());
    return name == null ? null
        : m("name", name, "qualifier", clip(receiver), "typeArguments", !call.getTypeArguments().isEmpty(),
            "typeArgumentList", clip(call.getTypeArgumentList()),
            "arguments", arguments(call));
  }
}
