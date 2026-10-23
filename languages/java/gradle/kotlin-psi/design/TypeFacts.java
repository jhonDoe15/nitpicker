package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Kinds;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.syntax.Mutables;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class TypeFacts {
  private TypeFacts() {}

  public static List<Object> build(Ctx ctx, boolean published) {
    List<Object> types = new ArrayList<>();
    for (Owner owner : ctx.index.owners) {
      if (owner.listed && (!owner.module() || hasMembers(owner))) {
        types.add(describe(ctx, owner, published));
      }
    }
    return types;
  }

  private static boolean hasMembers(Owner module) {
    return !module.funs.isEmpty() || !module.props.isEmpty();
  }

  private static Map<String, Object> describe(Ctx ctx, Owner owner, boolean published) {
    String kind = Kinds.of(owner);
    return m(
        "id", owner.id, "file", owner.source.path, "name", owner.name, "line", line(owner), "kind", kind,
        "exported", owner.exported, "published", published && owner.exported ? Boolean.TRUE : null,
        "fields", fields(owner, kind),
        "cases", kind.equals("enum") ? new ArrayList<Object>(owner.cases) : null,
        "references", references(ctx, owner));
  }

  private static List<Object> references(Ctx ctx, Owner owner) {
    if (!owner.module()) {
      return null;
    }
    List<Object> ids = new ArrayList<>();
    for (Fun target : ctx.references.initializers(owner)) {
      ids.add(target.id);
    }
    return ids.isEmpty() ? null : ids;
  }

  @SuppressWarnings("unchecked")
  public static void dropTargets(Map<String, Object> type, Set<String> missing) {
    Object references = type.get("references");
    if (references instanceof List) {
      ((List<Object>) references).removeIf(missing::contains);
      if (((List<?>) references).isEmpty()) {
        type.remove("references");
      }
    }
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
