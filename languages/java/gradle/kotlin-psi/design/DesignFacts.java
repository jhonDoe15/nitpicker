package nitpicker.kotlinpsi.design;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
    boolean library = published && Published.library(ctx);
    List<Object> modules = new ArrayList<>();
    for (Source source : sources) {
      modules.add(m("file", source.path, "role", "production"));
    }
    List<Map<String, Object>> callables = new ArrayList<>();
    Set<String> failed = new HashSet<>();
    for (Owner owner : ctx.index.owners) {
      if (!owner.listed) {
        continue;
      }
      List<Fun> funs = new ArrayList<>(owner.constructors);
      funs.addAll(owner.funs);
      for (Fun function : funs) {
        try {
          callables.add(CallableFacts.build(ctx, function, library));
        } catch (StackOverflowError tooDeep) {
          failed.add(function.id);
          System.err.println(source(owner) + ": " + function.name + " is too deeply nested for design facts");
        }
      }
    }
    if (!failed.isEmpty()) {
      for (Map<String, Object> callable : callables) {
        CallableFacts.dropTargets(callable, failed);
      }
    }
    return m("modules", modules, "types", TypeFacts.build(ctx, library), "callables", new ArrayList<Object>(callables));
  }

  private static String source(Owner owner) {
    return owner.source.path;
  }
}
