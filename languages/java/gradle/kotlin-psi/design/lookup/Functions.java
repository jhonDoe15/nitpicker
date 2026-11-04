package nitpicker.kotlinpsi.design.lookup;

import java.util.ArrayList;
import java.util.List;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Arity;
import nitpicker.kotlinpsi.design.resolve.Overloads;

public final class Functions {
  public record Site(String name, List<Arity.Arg> args, Source source) {}

  private final Ctx ctx;

  public Functions(Ctx ctx) {
    this.ctx = ctx;
  }

  public List<Fun> plain(String name, Source source) {
    for (List<Fun> tier : tiers(name, source)) {
      List<Fun> plain = plainIn(tier, source);
      if (!plain.isEmpty()) {
        return plain;
      }
    }
    return new ArrayList<>();
  }

  public Fun extension(Ty receiver, Site site) {
    List<Fun> found = new ArrayList<>();
    for (List<Fun> tier : tiers(site.name(), site.source())) {
      found = extensionsIn(tier, receiver, site);
      if (!found.isEmpty()) {
        break;
      }
    }
    return found.size() == 1 ? found.get(0) : null;
  }

  private List<Fun> plainIn(List<Fun> tier, Source source) {
    List<Fun> plain = new ArrayList<>();
    for (Fun function : tier) {
      if (function.receiver == null && visible(function, source)) {
        plain.add(function);
      }
    }
    return plain;
  }

  private List<List<Fun>> tiers(String name, Source source) {
    List<List<Fun>> tiers = new ArrayList<>();
    String imported = source.imports.get(name);
    if (imported != null) {
      int dot = imported.lastIndexOf('.');
      tiers.add(ctx.index.topFuns(dot < 0 ? "" : imported.substring(0, dot), imported.substring(dot + 1)));
    }
    tiers.add(ctx.index.topFuns(source.pkg, name));
    List<Fun> stars = new ArrayList<>();
    for (String prefix : source.stars) {
      stars.addAll(ctx.index.topFuns(prefix, name));
    }
    tiers.add(stars);
    return tiers;
  }

  private boolean visible(Fun function, Source source) {
    return !function.isPrivate || function.owner.source == source;
  }

  private List<Fun> extensionsIn(List<Fun> tier, Ty receiver, Site site) {
    List<Fun> found = new ArrayList<>();
    for (Fun function : tier) {
      if (function.receiver != null && visible(function, site.source()) && receives(function, receiver)
          && Arity.bind(function.params, site.args()) != null) {
        found.add(function);
      }
    }
    return found;
  }

  private boolean receives(Fun function, Ty receiver) {
    Ty declared = ctx.names.resolve(function.receiver, function.owner.source);
    if (declared.project() && receiver.project()) {
      return ctx.hierarchy.subtype(receiver.owner, declared.owner);
    }
    if (!declared.project() && !receiver.project() && declared.known() && receiver.known()) {
      return Overloads.strip(declared.text).equals(Overloads.strip(receiver.text));
    }
    return false;
  }
}
