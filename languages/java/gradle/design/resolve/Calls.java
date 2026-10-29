package nitpicker.designfacts.resolve;

import com.sun.source.tree.*;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.scope.*;

public final class Calls {
  public record Resolved(MethodInfo target, String receiver) {
    public static final Resolved NONE = new Resolved(null, null);
  }

  private final Typer typer;
  private final Map<Tree, Resolved> cache = new IdentityHashMap<>();

  public Calls(Typer typer) {
    this.typer = typer;
  }

  public Resolved resolve(Tree tree, Ctx c) {
    Resolved cached = cache.get(tree);
    if (cached == null) {
      cached = compute(tree, c);
      cache.put(tree, cached);
    }
    return cached;
  }

  private Resolved compute(Tree tree, Ctx c) {
    if (tree instanceof NewClassTree creation) {
      return creation(creation, c);
    }
    MethodInvocationTree call = (MethodInvocationTree) tree;
    int argc = call.getArguments().size();
    if (call.getMethodSelect() instanceof IdentifierTree identifier) {
      return bare(identifier.getName().toString(), argc, c);
    }
    if (call.getMethodSelect() instanceof MemberSelectTree select) {
      return qualified(select, argc, c);
    }
    return Resolved.NONE;
  }

  private Resolved creation(NewClassTree creation, Ctx c) {
    TypeInfo type = typer.project.resolveTree(creation.getIdentifier(), c.site());
    if (type == null || type.isInterface()) {
      return Resolved.NONE;
    }
    int argc = creation.getArguments().size();
    return of(typer.lookup.constructor(type, argc), null);
  }

  private static Resolved of(Lookup.Found found, String receiver) {
    return found.method() == null ? Resolved.NONE : new Resolved(found.method(), receiver);
  }

  private Resolved bare(String name, int argc, Ctx c) {
    if (name.equals("this")) {
      return of(typer.lookup.constructor(c.owner, argc), null);
    }
    if (name.equals("super")) {
      TypeInfo parent = superclassOf(c.owner);
      return parent == null ? Resolved.NONE : of(typer.lookup.constructor(parent, argc), null);
    }
    for (TypeInfo type = c.owner; type != null; type = type.outer) {
      Lookup.Found found = typer.lookup.method(type, name, argc);
      if (found.ambiguous() || (found.method() == null && typer.lookup.incomplete(type))) {
        return Resolved.NONE;
      }
      if (found.method() != null) {
        boolean own = type == c.owner && !found.method().isStatic;
        return new Resolved(found.method(), own ? "this" : null);
      }
    }
    return staticImported(name, argc, c);
  }

  private TypeInfo superclassOf(TypeInfo type) {
    typer.project.link(type);
    return type.superclass;
  }

  private Resolved staticImported(String name, int argc, Ctx c) {
    Set<MethodInfo> candidates = new LinkedHashSet<>();
    for (String member : c.unit.staticSingle) {
      if (member.endsWith("." + name)) {
        String owner = member.substring(0, member.length() - name.length() - 1);
        candidates.add(staticMethod(owner, name, argc));
      }
    }
    for (String base : c.unit.staticOnDemand) {
      candidates.add(staticMethod(base, name, argc));
    }
    candidates.remove(null);
    boolean single = candidates.size() == 1;
    return single ? new Resolved(candidates.iterator().next(), null) : Resolved.NONE;
  }

  private MethodInfo staticMethod(String type, String name, int argc) {
    TypeInfo owner = typer.project.find(type);
    if (owner == null) {
      return null;
    }
    MethodInfo found = typer.lookup.method(owner, name, argc).method();
    return found != null && found.isStatic ? found : null;
  }

  private Resolved qualified(MemberSelectTree select, int argc, Ctx c) {
    String name = select.getIdentifier().toString();
    Tree base = Names.unparen(select.getExpression());
    TypeInfo self = selfReceiver(base, c);
    if (self != null) {
      String receiver = base instanceof IdentifierTree ? "this" : null;
      return of(typer.lookup.method(self, name, argc), receiver);
    }
    if (isSelf(base)) {
      return Resolved.NONE;
    }
    TypeInfo named = typer.typeNameOf(base, c);
    if (named != null) {
      MethodInfo found = typer.lookup.method(named, name, argc).method();
      return found != null && found.isStatic ? new Resolved(found, null) : Resolved.NONE;
    }
    TypeInfo type = typer.typeOf(base, c).type();
    return type == null
        ? Resolved.NONE
        : of(typer.lookup.method(type, name, argc), typer.keyOf(base, c));
  }

  public static boolean isSelf(Tree base) {
    boolean word =
        base instanceof IdentifierTree identifier
            && (identifier.getName().contentEquals("this")
                || identifier.getName().contentEquals("super"));
    return word
        || (base instanceof MemberSelectTree select
            && select.getIdentifier().contentEquals("this"));
  }

  private TypeInfo selfReceiver(Tree base, Ctx c) {
    return switch (base) {
      case IdentifierTree identifier when identifier.getName().contentEquals("super") ->
          superclassOf(c.owner);
      case IdentifierTree identifier when identifier.getName().contentEquals("this") -> c.owner;
      case MemberSelectTree select when select.getIdentifier().contentEquals("this") ->
          typer.project.resolveTree(select.getExpression(), c.site());
      default -> null;
    };
  }
}
