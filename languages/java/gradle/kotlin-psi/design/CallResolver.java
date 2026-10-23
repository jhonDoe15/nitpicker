package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class CallResolver {
  static final class Resolved {
    final Fun target;
    final Owner constructed;
    final boolean viaThis;

    Resolved(Fun target, Owner constructed, boolean viaThis) {
      this.target = target;
      this.constructed = constructed;
      this.viaThis = viaThis;
    }
  }

  private static final Resolved NONE = new Resolved(null, null, false);

  private final Ctx ctx;
  private final Map<KtCallExpression, Resolved> memo = new IdentityHashMap<>();

  CallResolver(Ctx ctx) {
    this.ctx = ctx;
  }

  Fun target(KtCallExpression call) {
    return resolve(call).target;
  }

  Resolved resolve(KtCallExpression call) {
    Resolved known = memo.get(call);
    if (known != null) {
      return known;
    }
    memo.put(call, NONE);
    Resolved result = compute(call);
    memo.put(call, result);
    return result;
  }

  private Resolved compute(KtCallExpression call) {
    String name = Ps.name(call);
    if (name == null) {
      return NONE;
    }
    List<Arity.Arg> args = Arity.args(call);
    KtExpression receiver = Ps.receiverOf(call);
    Source source = ctx.sourceOf(call);
    return receiver == null ? bare(call, name, args, source) : qualified(name, receiver, args, source);
  }

  private Resolved qualified(String name, KtExpression receiver, List<Arity.Arg> args, Source source) {
    Owner staticOwner = ctx.typer.staticOwner(receiver);
    if (staticOwner != null) {
      Owner holder = ctx.typer.objectOwner(staticOwner);
      Fun found = holder == null ? null : pick(ctx.members.funs(holder, name), args);
      if (found != null) {
        return new Resolved(found, null, false);
      }
      Owner nested = staticOwner.nested.get(name);
      return nested == null || holder != null && !ctx.members.funs(holder, name).isEmpty() ? NONE : constructor(nested, args);
    }
    Ty type = ctx.typer.typeOf(receiver);
    if (type.project()) {
      Fun member = pick(ctx.members.funs(type.owner, name), args);
      if (member != null) {
        return new Resolved(member, null, false);
      }
      if (ctx.members.prop(type.owner, name) != null) {
        return NONE;
      }
      return anyBindable(ctx.members.funs(type.owner, name), args) ? NONE : extension(name, type, args, source);
    }
    return type.known() ? extension(name, type, args, source) : NONE;
  }

  private Resolved bare(KtCallExpression call, String name, List<Arity.Arg> args, Source source) {
    if (localFunction(call, name)) {
      return NONE;
    }
    for (Bindings.Level level : ctx.bindings.levels(call)) {
      if (level.extension != null) {
        Resolved viaReceiver = receiverCall(level, name, args, source);
        if (viaReceiver != null) {
          return viaReceiver;
        }
        continue;
      }
      Owner owner = level.owner;
      if (!level.instance && !(owner.psi instanceof KtObjectDeclaration)) {
        Resolved companion = companionCall(owner, name, args, level.blurred);
        if (companion != null) {
          return companion;
        }
        continue;
      }
      List<Fun> members = ctx.members.funs(owner, name);
      Fun found = pick(members, args);
      if (found != null) {
        return level.blurred ? NONE : new Resolved(found, null, level.thisLevel);
      }
      if (!members.isEmpty() || ctx.members.prop(owner, name) != null || ctx.hierarchy.external(owner)) {
        return NONE;
      }
      Resolved companion = companionCall(owner, name, args, level.blurred);
      if (companion != null) {
        return companion;
      }
    }
    return levelsBlurred(call) ? NONE : topLevel(call, name, args, source);
  }

  private boolean levelsBlurred(KtCallExpression call) {
    for (PsiElement p = call.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtLambdaExpression && ctx.lambdas.receiver((KtLambdaExpression) p)
          || p instanceof KtObjectLiteralExpression) {
        return true;
      }
      if (p instanceof KtClassOrObject && ctx.index.byPsi.get(p) == null) {
        return true;
      }
    }
    return false;
  }

  private Resolved companionCall(Owner owner, String name, List<Arity.Arg> args, boolean blurred) {
    if (owner.companion == null) {
      return null;
    }
    Fun found = pick(ctx.members.funs(owner.companion, name), args);
    return found == null ? null : blurred ? NONE : new Resolved(found, null, false);
  }

  private Resolved receiverCall(Bindings.Level level, String name, List<Arity.Arg> args, Source source) {
    Ty receiver = ctx.names.resolve(level.extension.getReceiverTypeReference(), source);
    if (!receiver.project()) {
      return NONE;
    }
    List<Fun> members = ctx.members.funs(receiver.owner, name);
    Fun found = pick(members, args);
    if (found != null) {
      return level.blurred ? NONE : new Resolved(found, null, true);
    }
    return !members.isEmpty() || ctx.hierarchy.external(receiver.owner) ? NONE : null;
  }

  List<Fun> plainTopLevel(String name, Source source) {
    List<Fun> plain = new ArrayList<>();
    for (List<Fun> tier : tiers(name, source)) {
      for (Fun function : tier) {
        if (function.receiver == null && visible(function, source)) {
          plain.add(function);
        }
      }
      if (!plain.isEmpty()) {
        break;
      }
    }
    return plain;
  }

  private Resolved topLevel(KtCallExpression call, String name, List<Arity.Arg> args, Source source) {
    List<Fun> plain = plainTopLevel(name, source);
    Owner type = ctx.names.lookup(name, call, source);
    boolean isType = type != null && !type.module() && ctx.typer.constructible(type);
    if (isType && !plain.isEmpty()) {
      return NONE;
    }
    if (isType) {
      return constructor(type, args);
    }
    Fun found = pick(plain, args);
    return found == null ? NONE : new Resolved(found, null, false);
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

  private Resolved extension(String name, Ty receiver, List<Arity.Arg> args, Source source) {
    List<Fun> found = new ArrayList<>();
    for (List<Fun> tier : tiers(name, source)) {
      for (Fun function : tier) {
        if (function.receiver != null && visible(function, source) && receives(function, receiver)
            && Arity.bind(function.params, args) != null) {
          found.add(function);
        }
      }
      if (!found.isEmpty()) {
        break;
      }
    }
    return found.size() == 1 ? new Resolved(found.get(0), null, false) : NONE;
  }

  private boolean receives(Fun function, Ty receiver) {
    Ty declared = ctx.names.resolve(function.receiver, function.owner.source);
    if (declared.project() && receiver.project()) {
      return ctx.hierarchy.subtype(receiver.owner, declared.owner);
    }
    if (!declared.project() && !receiver.project() && declared.known() && receiver.known()) {
      return strip(declared.text).equals(strip(receiver.text));
    }
    return false;
  }

  private String strip(String text) {
    return text.endsWith("?") ? text.substring(0, text.length() - 1) : text;
  }

  Resolved constructor(Owner type, List<Arity.Arg> args) {
    return new Resolved(pick(type.constructors, args), type, false);
  }

  private boolean anyBindable(List<Fun> candidates, List<Arity.Arg> args) {
    for (Fun candidate : candidates) {
      if (Arity.bind(candidate.params, args) != null) {
        return true;
      }
    }
    return false;
  }

  private Fun pick(List<Fun> candidates, List<Arity.Arg> args) {
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

  private boolean localFunction(KtCallExpression call, String name) {
    for (PsiElement p = call.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtBlockExpression) {
        for (KtExpression statement : ((KtBlockExpression) p).getStatements()) {
          if (statement instanceof KtNamedFunction && name.equals(((KtNamedFunction) statement).getName())) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
