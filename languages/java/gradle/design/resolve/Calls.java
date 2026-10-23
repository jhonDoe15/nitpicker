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
    TypeInfo type = typer.project.resolveTree(creation.getIdentifier(), c.owner, c.unit, c.typeVars);
    if (type == null || type.isInterface()) {
      return Resolved.NONE;
    }
    return of(typer.lookup.constructor(type, creation.getArguments().size()), null);
  }

  private static Resolved of(Lookup.Found found, String receiver) {
    return found.method() == null ? Resolved.NONE : new Resolved(found.method(), receiver);
  }

  private Resolved bare(String name, int argc, Ctx c) {
    Lookup lookup = typer.lookup;
    if (name.equals("this")) {
      return of(lookup.constructor(c.owner, argc), null);
    }
    if (name.equals("super")) {
      typer.project.link(c.owner);
      return c.owner.superclass == null ? Resolved.NONE : of(lookup.constructor(c.owner.superclass, argc), null);
    }
    for (TypeInfo type = c.owner; type != null; type = type.outer) {
      Lookup.Found found = lookup.method(type, name, argc);
      if (found.ambiguous()) {
        return Resolved.NONE;
      }
      if (found.method() != null) {
        boolean own = type == c.owner && !found.method().isStatic;
        return new Resolved(found.method(), own ? "this" : null);
      }
      if (lookup.incomplete(type)) {
        return Resolved.NONE;
      }
    }
    return staticImported(name, argc, c);
  }

  private Resolved staticImported(String name, int argc, Ctx c) {
    Set<MethodInfo> candidates = new LinkedHashSet<>();
    for (String member : c.unit.staticSingle) {
      if (member.endsWith("." + name)) {
        addStatic(candidates, member.substring(0, member.length() - name.length() - 1), name, argc);
      }
    }
    for (String base : c.unit.staticOnDemand) {
      addStatic(candidates, base, name, argc);
    }
    return candidates.size() == 1 ? new Resolved(candidates.iterator().next(), null) : Resolved.NONE;
  }

  private void addStatic(Set<MethodInfo> candidates, String type, String name, int argc) {
    TypeInfo owner = typer.project.find(type);
    if (owner != null) {
      Lookup.Found found = typer.lookup.method(owner, name, argc);
      if (found.method() != null && found.method().isStatic) {
        candidates.add(found.method());
      }
    }
  }

  private Resolved qualified(MemberSelectTree select, int argc, Ctx c) {
    String name = select.getIdentifier().toString();
    Tree base = Names.unparen(select.getExpression());
    Lookup lookup = typer.lookup;
    if (base instanceof IdentifierTree identifier) {
      String word = identifier.getName().toString();
      if (word.equals("super")) {
        typer.project.link(c.owner);
        return c.owner.superclass == null ? Resolved.NONE : of(lookup.method(c.owner.superclass, name, argc), "this");
      }
      if (word.equals("this")) {
        return of(lookup.method(c.owner, name, argc), "this");
      }
    }
    if (base instanceof MemberSelectTree outerThis && outerThis.getIdentifier().contentEquals("this")) {
      TypeInfo outer = typer.project.resolveTree(outerThis.getExpression(), c.owner, c.unit, c.typeVars);
      return outer == null ? Resolved.NONE : of(lookup.method(outer, name, argc), null);
    }
    TypeInfo named = typer.typeNameOf(base, c);
    if (named != null) {
      Lookup.Found found = lookup.method(named, name, argc);
      return found.method() != null && found.method().isStatic ? new Resolved(found.method(), null) : Resolved.NONE;
    }
    Ty baseType = typer.typeOf(base, c);
    if (baseType.type() == null) {
      return Resolved.NONE;
    }
    return of(lookup.method(baseType.type(), name, argc), typer.keyOf(base, c));
  }
}
