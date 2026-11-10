package nitpicker.kotlinpsi.design.declare;

import java.util.ArrayList;
import nitpicker.kotlinpsi.design.judge.Owned;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.syntax.Mutables;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Properties {
  private Properties() {}

  public static void constructorProperty(Owner owner, KtParameter parameter) {
    Prop.Shape shape = new Prop.Shape();
    shape.type = parameter.getTypeReference();
    shape.init = parameter.getDefaultValue();
    shape.isVar = parameter.isMutable();
    shape.isPrivate = Ps.isPrivate(parameter);
    shape.isProtected = Ps.isProtected(parameter);
    shape.field = true;
    shape.constructorParameter = true;
    owner.props.put(parameter.getName(), new Prop(owner, parameter, shape));
  }

  public static Prop property(Owner owner, KtProperty declaration) {
    if (declaration.getName() == null || declaration.getReceiverTypeReference() != null) {
      return null;
    }
    Prop.Shape shape = shape(declaration);
    shape.field = !abstractMember(owner, declaration) && !declaration.hasModifier(KtTokens.CONST_KEYWORD)
        && (declaration.hasInitializer() || declaration.hasDelegate()
            || declaration.hasModifier(KtTokens.LATEINIT_KEYWORD) || !computed(declaration));
    Prop prop = new Prop(owner, declaration, shape);
    owner.props.put(prop.name, prop);
    accessor(prop, declaration);
    return prop;
  }

  public static void aliasAccessors(Owner owner) {
    for (Prop prop : new ArrayList<>(owner.props.values())) {
      Prop backing = prop.getter != null ? null : backing(owner, prop);
      if (backing != null && prop.psi instanceof KtProperty) {
        Fun.Shape shape = new Fun.Shape();
        shape.returns = prop.type;
        shape.hasBody = true;
        Fun function = new Fun(owner, (KtProperty) prop.psi, shape.named(prop.name, Fun.ACCESSOR));
        function.returnsField = backing.name;
        link(prop, function);
      }
    }
  }

  private static Prop.Shape shape(KtProperty declaration) {
    Prop.Shape shape = new Prop.Shape();
    shape.type = declaration.getTypeReference();
    shape.init = declaration.getInitializer();
    shape.isVar = declaration.isVar();
    shape.isPrivate = Ps.isPrivate(declaration);
    shape.isProtected = Ps.isProtected(declaration);
    shape.delegated = declaration.hasDelegate();
    return shape;
  }

  private static boolean computed(KtProperty declaration) {
    return declaration.getAccessors().stream().anyMatch(KtPropertyAccessor::hasBody);
  }

  private static boolean abstractMember(Owner owner, KtProperty declaration) {
    boolean inInterface = owner.psi instanceof KtClass && ((KtClass) owner.psi).isInterface();
    return inInterface || declaration.hasModifier(KtTokens.ABSTRACT_KEYWORD);
  }

  private static void accessor(Prop prop, KtProperty declaration) {
    KtPropertyAccessor getter = declaration.getGetter();
    Fun.Shape shape = new Fun.Shape();
    shape.returns = declaration.getTypeReference();
    shape.isOverride = declaration.hasModifier(KtTokens.OVERRIDE_KEYWORD);
    shape.hasBody = true;
    if (getter != null && getter.hasBody()) {
      link(prop, withBody(prop, getter, shape));
    } else if (abstractMember(prop.owner, declaration)) {
      shape.hasBody = false;
      link(prop, declared(prop, shape));
    } else if (exposesCollection(prop)) {
      Fun function = declared(prop, shape);
      function.returnsField = prop.name;
      link(prop, function);
    }
  }

  private static Fun withBody(Prop prop, KtPropertyAccessor getter, Fun.Shape shape) {
    shape.isPrivate = prop.isPrivate || Ps.isPrivate(getter);
    shape.isProtected = prop.isProtected || Ps.isProtected(getter);
    Fun function = new Fun(prop.owner, getter, shape.named(prop.name, Fun.ACCESSOR));
    function.roots.add(getter.getBodyExpression());
    return function;
  }

  private static Fun declared(Prop prop, Fun.Shape shape) {
    shape.isPrivate = prop.isPrivate;
    shape.isProtected = prop.isProtected;
    return new Fun(prop.owner, (KtProperty) prop.psi, shape.named(prop.name, Fun.ACCESSOR));
  }

  private static boolean exposesCollection(Prop prop) {
    return !prop.hidden() && !prop.isVar && prop.field && Owned.created(prop) && !Mutables.readOnlyType(prop.type);
  }

  private static Prop backing(Owner owner, Prop prop) {
    if (prop.hidden() || prop.isVar || prop.constructorParameter || prop.init == null) {
      return null;
    }
    String target = fieldName(prop.init);
    Prop backing = target == null ? null : owner.props.get(target);
    boolean owned = backing != null && backing != prop && !backing.isVar && backing.field && Owned.created(backing);
    return owned ? backing : null;
  }

  private static void link(Prop prop, Fun function) {
    function.property = prop;
    prop.getter = function;
    prop.owner.funs.add(function);
  }

  private static String fieldName(KtExpression initializer) {
    KtExpression expression = Ps.strip(initializer);
    if (expression instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) expression).getReceiverExpression() instanceof KtThisExpression) {
      expression = ((KtDotQualifiedExpression) expression).getSelectorExpression();
    }
    return expression instanceof KtNameReferenceExpression
        ? ((KtNameReferenceExpression) expression).getReferencedName()
        : null;
  }
}
