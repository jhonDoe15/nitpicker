package nitpicker.designfacts;

import java.util.*;

final class Ctx {
  final TypeInfo owner;
  final Unit unit;
  final Set<String> typeVars;
  private final Deque<Map<String, Local>> scopes = new ArrayDeque<>();

  Ctx(TypeInfo owner, Set<String> typeVars) {
    this.owner = owner;
    this.unit = owner.unit;
    this.typeVars = typeVars;
    push();
  }

  static Ctx forType(TypeInfo owner) {
    return new Ctx(owner, Set.of());
  }

  void push() {
    scopes.push(new HashMap<>());
  }

  void pop() {
    scopes.pop();
  }

  Local lookup(String name) {
    for (Map<String, Local> scope : scopes) {
      Local found = scope.get(name);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  Local declare(String name, Ty ty, int param) {
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
