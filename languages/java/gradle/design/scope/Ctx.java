package nitpicker.designfacts.scope;

import java.util.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;

public final class Ctx {
  public final TypeInfo owner;
  public final Unit unit;
  public final Set<String> typeVars;
  public MethodInfo method;
  private final Deque<Map<String, Local>> scopes = new ArrayDeque<>();

  public Ctx(TypeInfo owner, Set<String> typeVars) {
    this.owner = owner;
    this.unit = owner.unit;
    this.typeVars = typeVars;
    push();
  }

  public Project.Site site() {
    return new Project.Site(owner, unit, typeVars);
  }

  public static Ctx forMethod(MethodInfo method) {
    Ctx ctx = new Ctx(method.owner, method.typeVars);
    ctx.method = method;
    return ctx;
  }

  public static Ctx forType(TypeInfo owner) {
    return new Ctx(owner, Set.of());
  }

  public void push() {
    scopes.push(new HashMap<>());
  }

  public void pop() {
    scopes.pop();
  }

  public Local lookup(String name) {
    for (Map<String, Local> scope : scopes) {
      Local found = scope.get(name);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  public Local declare(String name, Ty ty, int param) {
    Local existing = lookup(name);
    if (existing != null && param < 0) {
      existing.ty = Ty.UNKNOWN;
      return existing;
    }
    Local local = new Local(name, ty, param);
    scopes.peek().put(name, local);
    return local;
  }
}
