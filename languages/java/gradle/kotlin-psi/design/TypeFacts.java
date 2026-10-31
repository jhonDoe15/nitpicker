package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.judge.Owned;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Kinds;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class TypeFacts {
  private TypeFacts() {}

  public static List<Object> build(Ctx ctx) {
    List<Object> types = new ArrayList<>();
    for (Owner owner : ctx.index.owners) {
      if (owner.listed && (!owner.module() || hasMembers(owner))) {
        types.add(describe(ctx, owner));
      }
    }
    return types;
  }

  private static boolean hasMembers(Owner module) {
    return !module.funs.isEmpty() || !module.props.isEmpty();
  }

  private static Map<String, Object> describe(Ctx ctx, Owner owner) {
    String kind = Kinds.of(owner);
    return m(
        "id", owner.id, "file", owner.source.path, "name", owner.name, "line", line(owner), "kind", kind,
        "exported", owner.exported, "published", ctx.library && owner.exported ? Boolean.TRUE : null,
        "fields", fields(ctx, owner, kind),
        "cases", kind.equals("enum") ? new ArrayList<Object>(owner.cases) : null,
        "supertypes", supertypes(ctx, owner),
        "references", references(ctx, owner));
  }

  private static List<Object> supertypes(Ctx ctx, Owner owner) {
    List<Object> ids = new ArrayList<>();
    for (Owner parent : ctx.hierarchy.supers(owner)) {
      if (parent.listed && !parent.module() && parent != owner && !ids.contains(parent.id)) {
        ids.add(parent.id);
      }
    }
    return ids.isEmpty() ? null : ids;
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
    return owner.source.line(firstDeclaration(owner));
  }

  private static PsiElement firstDeclaration(Owner module) {
    List<PsiElement> declarations = new ArrayList<>();
    for (Fun function : module.funs) {
      declarations.add(function.psi);
    }
    for (Prop prop : module.props.values()) {
      declarations.add(prop.psi);
    }
    PsiElement first = module.source.psi;
    int offset = Integer.MAX_VALUE;
    for (PsiElement declaration : declarations) {
      if (declaration.getTextOffset() < offset) {
        offset = declaration.getTextOffset();
        first = declaration;
      }
    }
    return first;
  }

  private static List<Object> fields(Ctx ctx, Owner owner, String kind) {
    List<Object> fields = new ArrayList<>();
    if (kind.equals("interface")) {
      return null;
    }
    for (Prop prop : owner.props.values()) {
      if (prop.field || kind.equals("data")) {
        fields.add(m("name", prop.name, "mutable", Owned.mutable(ctx, prop) ? Boolean.TRUE : null,
            "private", prop.hidden() ? Boolean.TRUE : null));
      }
    }
    return fields.isEmpty() ? null : fields;
  }
}
