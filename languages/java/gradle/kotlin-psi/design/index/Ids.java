package nitpicker.kotlinpsi.design.index;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.psi.KtParameter;

public final class Ids {
  private Ids() {}

  public static void assign(List<Owner> owners) {
    Set<String> used = new HashSet<>();
    for (Owner owner : owners) {
      assign(owner, used);
    }
  }

  private static void assign(Owner owner, Set<String> used) {
    List<Fun> all = new ArrayList<>(owner.funs);
    all.addAll(owner.constructors);
    Map<String, List<Fun>> groups = new LinkedHashMap<>();
    for (Fun function : all) {
      groups.computeIfAbsent(base(owner, function), key -> new ArrayList<>()).add(function);
    }
    for (Map.Entry<String, List<Fun>> group : groups.entrySet()) {
      for (Fun function : group.getValue()) {
        String id = group.getValue().size() == 1 ? group.getKey() : group.getKey() + "(" + signature(function) + ")";
        function.id = unique(id, used);
      }
    }
  }

  private static String base(Owner owner, Fun function) {
    String path = owner.source.path + "#";
    String prefix = owner.module() ? "" : owner.qname + ".";
    if (function.constructor()) {
      return path + owner.qname + ".<init>";
    }
    String name = function.name + (function.receiver == null ? "" : "@" + Ps.typeText(function.receiver));
    return path + prefix + name + (Fun.ACCESSOR.equals(function.kind) ? ":get" : "");
  }

  private static String signature(Fun function) {
    List<String> types = new ArrayList<>();
    for (KtParameter parameter : function.params) {
      String text = Ps.typeText(parameter.getTypeReference());
      types.add(text == null ? "?" : text);
    }
    return String.join(",", types);
  }

  private static String unique(String id, Set<String> used) {
    String candidate = id;
    for (int n = 2; !used.add(candidate); n++) {
      candidate = id + "~" + n;
    }
    return candidate;
  }
}
