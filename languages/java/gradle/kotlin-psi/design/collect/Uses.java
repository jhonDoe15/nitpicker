package nitpicker.kotlinpsi.design.collect;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Kinds;
import nitpicker.kotlinpsi.design.model.Ty;

public final class Uses {
  private static final class Use {
    public final Set<String> fields = new LinkedHashSet<>();
    public final List<Object> forwards = new ArrayList<>();
    public boolean opaque;
  }

  private final Map<Integer, Use> byParam = new LinkedHashMap<>();

  public Uses(Ctx ctx, Fun function) {
    for (int i = 0; i < function.params.size(); i++) {
      Ty type = ctx.names.resolve(function.params.get(i).getTypeReference(), function.owner.source);
      if (type.project() && type.owner.listed && Kinds.usable(type.owner) && !function.params.get(i).isVarArg()) {
        byParam.put(i, new Use());
      }
    }
  }

  public boolean tracked(int index) {
    return byParam.containsKey(index);
  }

  public void opaque(int index) {
    byParam.get(index).opaque = true;
  }

  public void field(int index, String name) {
    byParam.get(index).fields.add(name);
  }

  public void forward(int index, String target, int position) {
    byParam.get(index).forwards.add(m("target", target, "position", position));
  }

  public List<Object> facts() {
    List<Object> facts = new ArrayList<>();
    for (Map.Entry<Integer, Use> entry : byParam.entrySet()) {
      Use use = entry.getValue();
      facts.add(
          m(
              "param", entry.getKey(), "fields", new ArrayList<Object>(use.fields), "forwards", use.forwards,
              "opaque", use.opaque ? Boolean.TRUE : null));
    }
    return facts;
  }
}
