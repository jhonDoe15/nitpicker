package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.index.Index;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Source;

public final class DesignFacts {
  private DesignFacts() {}

  public static Map<String, Object> build(List<Source> sources, boolean published) {
    Ctx ctx = new Ctx(new Index(sources));
    ctx.library = published && Published.library(ctx);
    Set<String> failed = new HashSet<>();
    List<Map<String, Object>> callables = callables(ctx, failed);
    List<Object> types = TypeFacts.build(ctx);
    dropFailed(callables, types, failed);
    return m("modules", modules(sources), "types", types, "callables", new ArrayList<Object>(callables));
  }

  private static List<Object> modules(List<Source> sources) {
    List<Object> modules = new ArrayList<>();
    for (Source source : sources) {
      modules.add(m("file", source.path, "role", "production"));
    }
    return modules;
  }

  private static List<Map<String, Object>> callables(Ctx ctx, Set<String> failed) {
    List<Map<String, Object>> callables = new ArrayList<>();
    for (Owner owner : ctx.index.owners) {
      if (owner.listed) {
        callables.addAll(callablesOf(ctx, owner, failed));
      }
    }
    return callables;
  }

  @SuppressWarnings("unchecked")
  private static void dropFailed(List<Map<String, Object>> callables, List<Object> types, Set<String> failed) {
    if (failed.isEmpty()) {
      return;
    }
    for (Map<String, Object> callable : callables) {
      CallableFacts.dropTargets(callable, failed);
    }
    for (Object type : types) {
      TypeFacts.dropTargets((Map<String, Object>) type, failed);
    }
  }

  private static List<Map<String, Object>> callablesOf(Ctx ctx, Owner owner, Set<String> failed) {
    List<Map<String, Object>> callables = new ArrayList<>();
    List<Fun> funs = new ArrayList<>(owner.constructors);
    funs.addAll(owner.funs);
    for (Fun function : funs) {
      try {
        callables.add(CallableFacts.build(ctx, function));
      } catch (StackOverflowError tooDeep) {
        failed.add(function.id);
        System.err.println(owner.source.path + ": " + function.name + " is too deeply nested for design facts");
      }
    }
    return callables;
  }
}
