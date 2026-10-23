package nitpicker.designfacts.resolve;

import com.sun.source.tree.*;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.scope.*;

public final class Typer {
  public final Project project;
  public final Lookup lookup;
  public final Calls calls;
  public final References references;

  public Typer(Project project, Lookup lookup) {
    this.project = project;
    this.lookup = lookup;
    this.calls = new Calls(this);
    this.references = new References(this);
  }

  public Ty tyOf(Tree type, Ctx c) {
    return switch (type) {
      case null -> Ty.UNKNOWN;
      case PrimitiveTypeTree primitive -> Ty.text(Names.typeText(primitive));
      case ArrayTypeTree array -> Ty.text(Names.typeText(array));
      case IdentifierTree identifier when identifier.getName().contentEquals("var") -> Ty.UNKNOWN;
      case WildcardTree wildcard -> Ty.UNKNOWN;
      default -> {
        TypeInfo resolved = project.resolveTree(type, c.owner, c.unit, c.typeVars);
        yield resolved != null ? Ty.of(resolved) : Ty.text(Names.typeText(type));
      }
    };
  }

  public Ty typeOf(Tree tree, Ctx c) {
    Tree expression = Names.unparen(tree);
    return switch (expression) {
      case IdentifierTree identifier -> identifierType(identifier.getName().toString(), c);
      case MemberSelectTree select -> selectType(select, c);
      case MethodInvocationTree call -> returnType(calls.resolve(call, c).target(), c);
      case NewClassTree creation -> tyOf(creation.getIdentifier(), c);
      case TypeCastTree cast -> tyOf(cast.getType(), c);
      case AssignmentTree assignment -> typeOf(assignment.getVariable(), c);
      case ConditionalExpressionTree conditional ->
          same(typeOf(conditional.getTrueExpression(), c), typeOf(conditional.getFalseExpression(), c));
      case LiteralTree literal ->
          literal.getValue() instanceof String ? Ty.text("String") : Ty.UNKNOWN;
      default -> Ty.UNKNOWN;
    };
  }

  private static Ty same(Ty left, Ty right) {
    return left.equals(right) ? left : Ty.UNKNOWN;
  }

  private Ty returnType(MethodInfo target, Ctx c) {
    if (target == null || target.ctor || target.returnType == null) {
      return Ty.UNKNOWN;
    }
    return tyOf(target.returnType, new Ctx(target.owner, target.typeVars));
  }

  private Ty identifierType(String name, Ctx c) {
    if (name.equals("this")) {
      return Ty.of(c.owner);
    }
    if (name.equals("super")) {
      project.link(c.owner);
      return c.owner.superclass == null ? Ty.UNKNOWN : Ty.of(c.owner.superclass);
    }
    Local local = c.lookup(name);
    if (local != null) {
      return local.ty;
    }
    return fieldType(lookup.bareField(name, c.owner));
  }

  public Ty fieldType(FieldInfo field) {
    return field == null ? Ty.UNKNOWN : tyOf(field.tree.getType(), Ctx.forType(field.owner));
  }

  private Ty selectType(MemberSelectTree select, Ctx c) {
    String name = select.getIdentifier().toString();
    Tree base = Names.unparen(select.getExpression());
    if (base instanceof IdentifierTree identifier && identifier.getName().contentEquals("this")) {
      return fieldType(lookup.field(c.owner, name));
    }
    TypeInfo named = typeNameOf(base, c);
    if (named != null) {
      return named.isEnum() && named.cases.contains(name) ? Ty.of(named) : fieldType(lookup.field(named, name));
    }
    Ty baseType = typeOf(base, c);
    if (baseType.type() != null) {
      return fieldType(lookup.field(baseType.type(), name));
    }
    return name.equals("length") && baseType.isArray() ? Ty.text("int") : Ty.UNKNOWN;
  }

  public TypeInfo typeNameOf(Tree tree, Ctx c) {
    List<String> parts = Names.segments(Names.unparen(tree));
    if (parts.isEmpty()) {
      return null;
    }
    String first = parts.get(0);
    if (c.lookup(first) != null || lookup.bareField(first, c.owner) != null) {
      return null;
    }
    return project.resolveQualified(parts, c.owner, c.unit, c.typeVars);
  }

  public String keyOf(Tree tree, Ctx c) {
    Tree expression = Names.unwrap(tree);
    if (expression instanceof IdentifierTree identifier) {
      String name = identifier.getName().toString();
      if (name.equals("this") || name.equals("super")) {
        return "this";
      }
      if (c.lookup(name) != null) {
        return name;
      }
      FieldInfo field = lookup.bareField(name, c.owner);
      return field != null && lookup.chain(c.owner).contains(field.owner) ? "this." + name : null;
    }
    if (expression instanceof MemberSelectTree select
        && Names.unparen(select.getExpression()) instanceof IdentifierTree base
        && base.getName().contentEquals("this")
        && lookup.field(c.owner, select.getIdentifier().toString()) != null) {
      return "this." + select.getIdentifier();
    }
    return null;
  }

  public FieldInfo fieldRef(Tree tree, Ctx c) {
    Tree expression = Names.unparen(tree);
    if (expression instanceof IdentifierTree identifier) {
      String name = identifier.getName().toString();
      return c.lookup(name) != null ? null : lookup.bareField(name, c.owner);
    }
    if (expression instanceof MethodInvocationTree call) {
      MethodInfo target = calls.resolve(call, c).target();
      return target == null || target.accessorField == null ? null : lookup.field(target.owner, target.accessorField);
    }
    if (!(expression instanceof MemberSelectTree select)) {
      return null;
    }
    String name = select.getIdentifier().toString();
    Tree base = Names.unparen(select.getExpression());
    if (base instanceof IdentifierTree identifier && identifier.getName().contentEquals("this")) {
      return lookup.field(c.owner, name);
    }
    TypeInfo named = typeNameOf(base, c);
    if (named != null) {
      return lookup.field(named, name);
    }
    Ty baseType = typeOf(base, c);
    return baseType.type() == null ? null : lookup.field(baseType.type(), name);
  }
}
