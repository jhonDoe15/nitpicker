package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import nitpicker.kotlinpsi.design.judge.Decisions;
import nitpicker.kotlinpsi.design.judge.Forwarding;
import nitpicker.kotlinpsi.design.judge.ReturnsField;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.syntax.Ps;
import nitpicker.kotlinpsi.design.walk.Walk;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class CallableFacts {
  private static final Map<String, String> ARRAYS =
      Map.of("Int", "IntArray", "Long", "LongArray", "Double", "DoubleArray", "Float", "FloatArray", "Boolean",
          "BooleanArray", "Char", "CharArray", "Byte", "ByteArray", "Short", "ShortArray");

  private CallableFacts() {}

  public static Map<String, Object> build(Ctx ctx, Fun function) {
    Walk walk = new Walk(ctx, function);
    walk.run();
    Source source = function.owner.source;
    Map<String, Object> forward = Forwarding.of(ctx, function);
    boolean exported = !function.hidden() && function.owner.exported;
    return m(
        "id", function.id, "file", source.path, "name", function.name, "line", line(function, source),
        "kind", function.kind, "owner", function.owner.id,
        "exported", exported,
        "entry", Entries.of(function) ? Boolean.TRUE : null,
        "published", ctx.library && exported && function.owner.module() ? Boolean.TRUE : null,
        "references", nonEmpty(new ArrayList<Object>(walk.references)),
        "params", params(ctx, function),
        "returns", returns(ctx, function), "forward", forward, "calls", nonEmpty(walk.calls),
        "paramUses", nonEmpty(walk.uses.facts()), "ownFields", nonEmpty(new ArrayList<Object>(walk.own)),
        "returnsField", ReturnsField.of(ctx, function),
        "decisions", nonEmpty(new Decisions(ctx, function).run()), "reads", nonEmpty(walk.reads.facts()));
  }

  @SuppressWarnings("unchecked")
  public static void dropTargets(Map<String, Object> callable, Set<String> missing) {
    Object forward = callable.get("forward");
    if (forward instanceof Map && missing.contains(((Map<?, ?>) forward).get("target"))) {
      callable.remove("forward");
    }
    Object uses = callable.get("paramUses");
    if (uses instanceof List) {
      for (Object use : (List<?>) uses) {
        dropForwards((Map<String, Object>) use, missing);
      }
    }
    dropFrom(callable, "references", missing::contains);
    dropFrom(callable, "calls", call -> missing.contains(((Map<?, ?>) call).get("target")));
  }

  private static void dropFrom(Map<String, Object> callable, String key, Predicate<Object> missing) {
    Object list = callable.get(key);
    if (list instanceof List) {
      ((List<?>) list).removeIf(missing);
      if (((List<?>) list).isEmpty()) {
        callable.remove(key);
      }
    }
  }

  @SuppressWarnings("unchecked")
  private static void dropForwards(Map<String, Object> use, Set<String> missing) {
    List<Object> forwards = (List<Object>) use.get("forwards");
    int before = forwards.size();
    forwards.removeIf(forward -> missing.contains(((Map<?, ?>) forward).get("target")));
    if (forwards.size() != before) {
      use.put("opaque", Boolean.TRUE);
    }
  }

  private static <T> List<T> nonEmpty(List<T> list) {
    return list.isEmpty() ? null : list;
  }

  private static int line(Fun function, Source source) {
    PsiElement at = function.psi;
    if (function.psi instanceof KtNamedDeclaration && !(function.psi instanceof KtPropertyAccessor)
        && ((KtNamedDeclaration) function.psi).getNameIdentifier() != null) {
      at = ((KtNamedDeclaration) function.psi).getNameIdentifier();
    }
    return source.line(at);
  }

  private static List<Object> params(Ctx ctx, Fun function) {
    List<Object> params = new ArrayList<>();
    for (KtParameter parameter : function.params) {
      params.add(
          m(
              "name", parameter.getName(), "type", type(ctx, parameter, function.owner.source),
              "variadic", parameter.isVarArg() ? Boolean.TRUE : null,
              "optional", parameter.hasDefaultValue() ? Boolean.TRUE : null));
    }
    return nonEmpty(params);
  }

  private static String type(Ctx ctx, KtParameter parameter, Source source) {
    if (parameter.getTypeReference() == null) {
      return null;
    }
    if (parameter.isVarArg()) {
      String element = Ps.typeText(parameter.getTypeReference());
      return ARRAYS.getOrDefault(element, "Array");
    }
    return ctx.names.resolve(parameter.getTypeReference(), source).normalized();
  }

  private static String returns(Ctx ctx, Fun function) {
    if (function.returns == null || function.constructor()) {
      return null;
    }
    return ctx.names.resolve(function.returns, function.owner.source).normalized();
  }
}
