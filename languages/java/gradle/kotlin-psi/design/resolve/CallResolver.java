package nitpicker.kotlinpsi.design.resolve;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.lookup.Functions;
import nitpicker.kotlinpsi.design.lookup.Functions.Site;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class CallResolver {
  public static final class Resolved {
    public final Fun target;
    public final Owner constructed;
    public final boolean viaThis;
    public final Implicit implicit;

    public Resolved(Fun target, Owner constructed, boolean viaThis) {
      this.target = target;
      this.constructed = constructed;
      this.viaThis = viaThis;
      this.implicit = null;
    }

    private Resolved(Fun target, Implicit implicit) {
      this.target = target;
      this.constructed = null;
      this.viaThis = false;
      this.implicit = implicit;
    }

    public static Resolved through(Fun target, KtExpression receiver) {
      return new Resolved(target, new Implicit(receiver, false));
    }

    public static Resolved hidden(KtExpression receiver) {
      return new Resolved(null, new Implicit(receiver, true));
    }
  }

  public record Implicit(KtExpression receiver, boolean opaque) {}

  private static final Resolved NONE = new Resolved(null, null, false);

  private final Ctx ctx;
  private final Overloads overloads;
  private final Functions functions;
  private final Map<KtCallExpression, Resolved> memo = new IdentityHashMap<>();

  public CallResolver(Ctx ctx) {
    this.ctx = ctx;
    this.overloads = new Overloads(ctx);
    this.functions = new Functions(ctx);
  }

  public Fun target(KtCallExpression call) {
    return resolve(call).target;
  }

  public Resolved resolve(KtCallExpression call) {
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
    Site site = new Site(name, Arity.args(call), ctx.sourceOf(call));
    KtExpression receiver = Ps.receiverOf(call);
    return receiver == null ? bare(call, site) : qualified(site, receiver);
  }

  private Resolved qualified(Site site, KtExpression receiver) {
    Owner staticOwner = ctx.typer.staticOwner(receiver);
    if (staticOwner != null) {
      return staticCall(staticOwner, site);
    }
    Ty type = ctx.typer.typeOf(receiver);
    if (type.project()) {
      return memberCall(type, site);
    }
    return type.known() ? extension(type, site) : NONE;
  }

  private Resolved staticCall(Owner staticOwner, Site site) {
    Owner holder = ctx.typer.objectOwner(staticOwner);
    Fun found = holder == null ? null : overloads.pick(ctx.members.funs(holder, site.name()), site.args());
    if (found != null) {
      return new Resolved(found, null, false);
    }
    Owner nested = staticOwner.nested.get(site.name());
    boolean shadowed = holder != null && !ctx.members.funs(holder, site.name()).isEmpty();
    return nested == null || shadowed ? NONE : constructor(nested, site.args());
  }

  private Resolved memberCall(Ty type, Site site) {
    Fun member = overloads.pick(ctx.members.funs(type.owner, site.name()), site.args());
    if (member != null) {
      return new Resolved(member, null, false);
    }
    if (ctx.members.prop(type.owner, site.name()) != null) {
      return NONE;
    }
    boolean bindable = overloads.anyBindable(ctx.members.funs(type.owner, site.name()), site.args());
    return bindable ? NONE : extension(type, site);
  }

  private Resolved bare(KtCallExpression call, Site site) {
    if (localFunction(call, site.name())) {
      return NONE;
    }
    Resolved implicit = implicitReceiver(call, site);
    if (implicit != null) {
      return implicit;
    }
    for (Bindings.Level level : ctx.bindings.levels(call)) {
      Resolved found = atLevel(level, site);
      if (found != null) {
        return found;
      }
    }
    return levelsBlurred(call) ? NONE : topLevel(call, site);
  }

  private Resolved implicitReceiver(KtCallExpression call, Site site) {
    KtLambdaExpression lambda = receiverLambda(call);
    KtExpression receiver = lambda == null ? null : ctx.lambdas.implicitReceiver(lambda);
    Ty type = receiver == null ? Ty.UNKNOWN : ctx.typer.typeOf(receiver);
    if (!type.project()) {
      return null;
    }
    List<Fun> members = ctx.members.funs(type.owner, site.name());
    Fun found = overloads.pick(members, site.args());
    if (found != null) {
      return Resolved.through(found, receiver);
    }
    boolean member = !members.isEmpty() || ctx.members.prop(type.owner, site.name()) != null
        || ctx.hierarchy.external(type.owner);
    return member ? Resolved.hidden(receiver) : null;
  }

  private KtLambdaExpression receiverLambda(KtCallExpression call) {
    for (PsiElement p = call.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtLambdaExpression && ctx.lambdas.receiver((KtLambdaExpression) p)) {
        return (KtLambdaExpression) p;
      }
    }
    return null;
  }

  private Resolved atLevel(Bindings.Level level, Site site) {
    if (level.extension() != null) {
      return receiverCall(level, site);
    }
    Owner owner = level.owner();
    if (!level.instance() && !(owner.psi instanceof KtObjectDeclaration)) {
      return companionCall(owner, site, level.blurred());
    }
    List<Fun> members = ctx.members.funs(owner, site.name());
    Fun found = overloads.pick(members, site.args());
    if (found != null) {
      return level.blurred() ? NONE : new Resolved(found, null, level.thisLevel());
    }
    if (!members.isEmpty() || ctx.members.prop(owner, site.name()) != null || ctx.hierarchy.external(owner)) {
      return NONE;
    }
    return companionCall(owner, site, level.blurred());
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

  private Resolved companionCall(Owner owner, Site site, boolean blurred) {
    if (owner.companion == null) {
      return null;
    }
    Fun found = overloads.pick(ctx.members.funs(owner.companion, site.name()), site.args());
    return found == null ? null : blurred ? NONE : new Resolved(found, null, false);
  }

  private Resolved receiverCall(Bindings.Level level, Site site) {
    Ty receiver = ctx.names.resolve(level.extension().getReceiverTypeReference(), site.source());
    if (!receiver.project()) {
      return NONE;
    }
    List<Fun> members = ctx.members.funs(receiver.owner, site.name());
    Fun found = overloads.pick(members, site.args());
    if (found != null) {
      return level.blurred() ? NONE : new Resolved(found, null, true);
    }
    return !members.isEmpty() || ctx.hierarchy.external(receiver.owner) ? NONE : null;
  }

  public List<Fun> plainTopLevel(String name, Source source) {
    return functions.plain(name, source);
  }

  private Resolved extension(Ty receiver, Site site) {
    Fun found = functions.extension(receiver, site);
    return found == null ? NONE : new Resolved(found, null, false);
  }

  private Resolved topLevel(KtCallExpression call, Site site) {
    List<Fun> plain = plainTopLevel(site.name(), site.source());
    Owner type = ctx.names.lookup(site.name(), call, site.source());
    boolean isType = type != null && !type.module() && ctx.typer.constructible(type);
    if (isType && !plain.isEmpty()) {
      return NONE;
    }
    if (isType) {
      return constructor(type, site.args());
    }
    Fun found = overloads.pick(plain, site.args());
    return found == null ? NONE : new Resolved(found, null, false);
  }

  public Resolved constructor(Owner type, List<Arity.Arg> args) {
    return new Resolved(overloads.pick(type.constructors, args), type, false);
  }

  private boolean localFunction(KtCallExpression call, String name) {
    for (PsiElement p = call.getParent(); p != null; p = p.getParent()) {
      if (p instanceof KtBlockExpression && Ps.declaresFunction((KtBlockExpression) p, name)) {
        return true;
      }
    }
    return false;
  }
}
