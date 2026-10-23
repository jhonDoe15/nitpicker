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

/**
 * The design facts of a module: its production files, the types they declare and the callables of those types,
 * resolved from declarations, imports and written types alone (the sources are parsed, never compiled). When
 * {@code published} is set the module is a published library, so its exported types and top-level functions carry
 * {@code published: true}, unless the module has a {@code main} entry and is an application.
 */
public final class DesignFacts {
  private DesignFacts() {}

  public static Map<String, Object> build(List<Source> sources, boolean published) {
    Ctx ctx = new Ctx(new Index(sources));
    ctx.library = published && Published.library(ctx);
    List<Object> modules = new ArrayList<>();
    for (Source source : sources) {
      modules.add(m("file", source.path, "role", "production"));
    }
    List<Map<String, Object>> callables = new ArrayList<>();
    Set<String> failed = new HashSet<>();
    for (Owner owner : ctx.index.owners) {
      if (owner.listed) {
        callables.addAll(callablesOf(ctx, owner, failed));
      }
    }
    if (!failed.isEmpty()) {
      for (Map<String, Object> callable : callables) {
        CallableFacts.dropTargets(callable, failed);
      }
    }
    List<Object> types = TypeFacts.build(ctx);
    dropFromTypes(types, failed);
    return m("modules", modules, "types", types, "callables", new ArrayList<Object>(callables));
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

  @SuppressWarnings("unchecked")
  private static void dropFromTypes(List<Object> types, Set<String> failed) {
    if (!failed.isEmpty()) {
      for (Object type : types) {
        TypeFacts.dropTargets((Map<String, Object>) type, failed);
      }
    }
  }
}
