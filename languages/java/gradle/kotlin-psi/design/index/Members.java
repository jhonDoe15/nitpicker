package nitpicker.kotlinpsi.design.index;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.psi.KtParameter;

public final class Members {
  private final Hierarchy hierarchy;

  public Members(Hierarchy hierarchy) {
    this.hierarchy = hierarchy;
  }

  public Prop prop(Owner owner, String name) {
    for (Owner level : hierarchy.ancestors(owner)) {
      Prop found = level.props.get(name);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  public boolean hasMember(Owner owner, String name) {
    return prop(owner, name) != null || !funs(owner, name).isEmpty();
  }

  public List<Fun> funs(Owner owner, String name) {
    Map<String, Fun> bySignature = new LinkedHashMap<>();
    for (Owner level : hierarchy.ancestors(owner)) {
      collect(level, name, bySignature);
    }
    return new ArrayList<>(bySignature.values());
  }

  private static void collect(Owner level, String name, Map<String, Fun> bySignature) {
    for (Fun function : level.funs) {
      if (function.name.equals(name) && !Fun.ACCESSOR.equals(function.kind) && function.receiver == null) {
        bySignature.putIfAbsent(signature(function), function);
      }
    }
  }

  public Fun close(Owner owner) {
    List<Fun> found = new ArrayList<>();
    for (Fun function : funs(owner, "close")) {
      if (function.params.isEmpty()) {
        found.add(function);
      }
    }
    return found.size() == 1 ? found.get(0) : null;
  }

  public static String signature(Fun function) {
    StringBuilder out = new StringBuilder();
    for (KtParameter parameter : function.params) {
      String text = Ps.typeText(parameter.getTypeReference());
      out.append(parameter.isVarArg() ? "*" : "").append(text == null ? "?" : text).append(',');
    }
    return out.toString();
  }
}
