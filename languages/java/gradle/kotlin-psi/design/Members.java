package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.psi.KtParameter;

final class Members {
  private final Hierarchy hierarchy;

  Members(Hierarchy hierarchy) {
    this.hierarchy = hierarchy;
  }

  Prop prop(Owner owner, String name) {
    for (Owner level : hierarchy.ancestors(owner)) {
      Prop found = level.props.get(name);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  boolean hasMember(Owner owner, String name) {
    return prop(owner, name) != null || !funs(owner, name).isEmpty();
  }

  List<Fun> funs(Owner owner, String name) {
    Map<String, Fun> bySignature = new LinkedHashMap<>();
    for (Owner level : hierarchy.ancestors(owner)) {
      for (Fun function : level.funs) {
        if (function.name.equals(name) && !Fun.ACCESSOR.equals(function.kind) && function.receiver == null) {
          bySignature.putIfAbsent(signature(function), function);
        }
      }
    }
    return new ArrayList<>(bySignature.values());
  }

  Fun close(Owner owner) {
    List<Fun> found = new ArrayList<>();
    for (Fun function : funs(owner, "close")) {
      if (function.params.isEmpty()) {
        found.add(function);
      }
    }
    return found.size() == 1 ? found.get(0) : null;
  }

  static String signature(Fun function) {
    StringBuilder out = new StringBuilder();
    for (KtParameter parameter : function.params) {
      String text = Ps.typeText(parameter.getTypeReference());
      out.append(parameter.isVarArg() ? "*" : "").append(text == null ? "?" : text).append(',');
    }
    return out.toString();
  }
}
