package nitpicker.kotlinpsi.design.resolve;

import java.util.ArrayList;
import java.util.List;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Ty;
import org.jetbrains.kotlin.psi.KtParameter;

public final class Overloads {
  private final Ctx ctx;

  public Overloads(Ctx ctx) {
    this.ctx = ctx;
  }

  public static String strip(String text) {
    return text.endsWith("?") ? text.substring(0, text.length() - 1) : text;
  }

  public boolean anyBindable(List<Fun> candidates, List<Arity.Arg> args) {
    for (Fun candidate : candidates) {
      if (Arity.bind(candidate.params, args) != null) {
        return true;
      }
    }
    return false;
  }

  public Fun pick(List<Fun> candidates, List<Arity.Arg> args) {
    List<Fun> bindable = new ArrayList<>();
    for (Fun candidate : candidates) {
      if (Arity.bind(candidate.params, args) != null) {
        bindable.add(candidate);
      }
    }
    if (bindable.size() > 1) {
      bindable = compatible(bindable, args);
    }
    return bindable.size() == 1 ? bindable.get(0) : null;
  }

  private List<Fun> compatible(List<Fun> candidates, List<Arity.Arg> args) {
    List<Fun> fitting = new ArrayList<>();
    for (Fun candidate : candidates) {
      int[] mapping = Arity.bind(candidate.params, args);
      boolean fits = true;
      for (int i = 0; i < args.size() && fits; i++) {
        fits = argumentFits(candidate, mapping[i], args.get(i));
      }
      if (fits) {
        fitting.add(candidate);
      }
    }
    return fitting;
  }

  private boolean argumentFits(Fun function, int index, Arity.Arg arg) {
    KtParameter parameter = function.params.get(index);
    if (arg.expression == null || parameter.getTypeReference() == null) {
      return true;
    }
    Ty declared = ctx.names.resolve(parameter.getTypeReference(), function.owner.source);
    Ty actual = ctx.typer.typeOf(arg.expression);
    if (actual.project() && declared.project()) {
      return ctx.hierarchy.subtype(actual.owner, declared.owner);
    }
    if (actual.project() && declared.known()) {
      return !Arity.primitive(strip(declared.text));
    }
    if (actual.known() && declared.known() && !declared.project()) {
      return Arity.literalFits(actual.text, declared.text);
    }
    return true;
  }
}
