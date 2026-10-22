package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class TypeFacts {
  private TypeFacts() {}

  static List<Object> build(Ctx ctx) {
    List<Object> types = new ArrayList<>();
    for (Owner owner : ctx.index.owners) {
      if (owner.listed && (!owner.module() || hasMembers(owner))) {
        types.add(describe(owner));
      }
    }
    return types;
  }

  private static boolean hasMembers(Owner module) {
    return !module.funs.isEmpty() || !module.props.isEmpty();
  }

  private static Map<String, Object> describe(Owner owner) {
    String kind = Kinds.of(owner);
    return m(
        "id", owner.id, "file", owner.source.path, "name", owner.name, "line", line(owner), "kind", kind,
        "exported", owner.exported, "fields", fields(owner, kind),
        "cases", kind.equals("enum") ? new ArrayList<Object>(owner.cases) : null);
  }

  private static int line(Owner owner) {
    if (!owner.module()) {
      PsiElement at = owner.psi.getNameIdentifier() != null ? owner.psi.getNameIdentifier() : owner.psi;
      return owner.source.line(at);
    }
    int offset = Integer.MAX_VALUE;
    PsiElement first = owner.source.psi;
    for (Fun function : owner.funs) {
      if (function.psi.getTextOffset() < offset) {
        offset = function.psi.getTextOffset();
        first = function.psi;
      }
    }
    for (Prop prop : owner.props.values()) {
      if (prop.psi.getTextOffset() < offset) {
        offset = prop.psi.getTextOffset();
        first = prop.psi;
      }
    }
    return owner.source.line(first);
  }

  private static List<Object> fields(Owner owner, String kind) {
    List<Object> fields = new ArrayList<>();
    if (kind.equals("interface")) {
      return null;
    }
    for (Prop prop : owner.props.values()) {
      if (prop.field || kind.equals("data")) {
        boolean mutable = prop.field && !prop.isVar && !prop.constructorParameter && Mutables.created(prop.init);
        fields.add(m("name", prop.name, "mutable", mutable ? Boolean.TRUE : null,
            "private", prop.isPrivate ? Boolean.TRUE : null));
      }
    }
    return fields.isEmpty() ? null : fields;
  }
}
