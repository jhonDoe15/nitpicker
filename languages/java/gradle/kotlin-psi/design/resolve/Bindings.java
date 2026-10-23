package nitpicker.kotlinpsi.design.resolve;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

public final class Bindings {
  private static final Set<String> ENUM_MEMBERS = Set.of("name", "ordinal");

  private final Ctx ctx;

  public Bindings(Ctx ctx) {
    this.ctx = ctx;
  }

  private final class Scan {
    public final String name;
    public final Source source;
    public boolean blurred;
    public boolean instance = true;
    public boolean first = true;
    public boolean inFunction;

    public Scan(String name, Source source) {
      this.name = name;
      this.source = source;
    }

    public boolean blur(PsiElement p) {
      if (p instanceof KtLambdaExpression) {
        blurred |= ctx.lambdas.receiver((KtLambdaExpression) p);
        return true;
      }
      if (p instanceof KtObjectLiteralExpression) {
        blurred = true;
        return true;
      }
      return false;
    }

    public void leave(PsiElement p) {
      instance = instance && p instanceof KtClass && ((KtClass) p).isInner();
      first = false;
    }
  }

  public Binding bind(KtSimpleNameExpression ref) {
    Scan scan = new Scan(ref.getReferencedName(), ctx.sourceOf(ref));
    Declared declared = new Declared(scan.name, ref);
    PsiElement child = ref;
    for (PsiElement p = ref.getParent(); p != null; child = p, p = p.getParent()) {
      PsiElement local = declared.at(p, child, scan.inFunction);
      Binding found = local != null ? Binding.local(local) : step(scan, p);
      if (found != null) {
        return found;
      }
    }
    return scan.blurred ? Binding.UNKNOWN : topLevel(scan.name, ref, scan.source);
  }

  private Binding step(Scan scan, PsiElement p) {
    if (scan.blur(p)) {
      return null;
    }
    if (p instanceof KtPropertyAccessor && "field".equals(scan.name)) {
      return accessorField((KtPropertyAccessor) p, scan.blurred);
    }
    if (p instanceof KtNamedFunction || p instanceof KtPropertyAccessor || p instanceof KtSecondaryConstructor) {
      scan.inFunction = true;
      return p instanceof KtNamedFunction ? extension((KtNamedFunction) p, scan) : null;
    }
    return p instanceof KtClassOrObject ? classLevel(scan, p) : null;
  }

  private Binding classLevel(Scan scan, PsiElement p) {
    Owner owner = ctx.index.byPsi.get(p);
    if (owner == null) {
      scan.blurred = true;
      return null;
    }
    Binding found = member(owner, scan, scan.first && scan.instance);
    scan.leave(p);
    return found;
  }

  public record Level(Owner owner, KtNamedFunction extension, boolean instance, boolean thisLevel, boolean blurred) {}

  public List<Level> levels(PsiElement at) {
    List<Level> levels = new ArrayList<>();
    Scan scan = new Scan(null, null);
    for (PsiElement p = at.getParent(); p != null; p = p.getParent()) {
      Level level = level(scan, p);
      if (level != null) {
        levels.add(level);
      }
    }
    return levels;
  }

  private Level level(Scan scan, PsiElement p) {
    if (scan.blur(p)) {
      return null;
    }
    if (p instanceof KtNamedFunction && ((KtNamedFunction) p).getReceiverTypeReference() != null) {
      return new Level(null, (KtNamedFunction) p, false, false, scan.blurred);
    }
    Owner owner = p instanceof KtClassOrObject ? ctx.index.byPsi.get(p) : null;
    if (owner == null) {
      scan.blurred |= p instanceof KtClassOrObject;
      return null;
    }
    Level level = new Level(owner, null, scan.instance, scan.first && scan.instance, scan.blurred);
    scan.leave(p);
    return level;
  }

  private Binding accessorField(KtPropertyAccessor accessor, boolean blurred) {
    KtProperty property = accessor.getProperty();
    Owner owner = ctx.index.byPsi.get(PsiTreeUtil.getParentOfType(property, KtClassOrObject.class, true));
    Prop prop = owner == null ? null : owner.props.get(property.getName());
    return prop == null || blurred ? Binding.UNKNOWN : Binding.field(prop, true);
  }

  private Binding extension(KtNamedFunction function, Scan scan) {
    if (function.getReceiverTypeReference() == null) {
      return null;
    }
    Ty receiver = ctx.names.resolve(function.getReceiverTypeReference(), scan.source);
    if (!receiver.project()) {
      return Binding.UNKNOWN;
    }
    Prop prop = ctx.members.prop(receiver.owner, scan.name);
    if (prop != null) {
      return scan.blurred ? Binding.UNKNOWN : Binding.receiverField(prop);
    }
    return ctx.hierarchy.external(receiver.owner) ? Binding.UNKNOWN : null;
  }

  private Binding member(Owner owner, Scan scan, boolean thisLevel) {
    Prop prop = scan.instance || owner.psi instanceof KtObjectDeclaration ? ctx.members.prop(owner, scan.name) : null;
    if (prop != null) {
      return scan.blurred ? Binding.UNKNOWN : Binding.field(prop, thisLevel);
    }
    if (owner.companion != null) {
      Prop companion = ctx.members.prop(owner.companion, scan.name);
      if (companion != null) {
        return scan.blurred ? Binding.UNKNOWN : Binding.field(companion, false);
      }
    }
    boolean enumClass = owner.psi instanceof KtClass && ((KtClass) owner.psi).isEnum();
    if (scan.instance && (ctx.hierarchy.external(owner) || enumClass && ENUM_MEMBERS.contains(scan.name))) {
      return Binding.UNKNOWN;
    }
    return null;
  }

  private Binding topLevel(String name, PsiElement at, Source source) {
    String imported = source.imports.get(name);
    if (imported != null) {
      int dot = imported.lastIndexOf('.');
      String pkg = dot < 0 ? "" : imported.substring(0, dot);
      Binding found = single(ctx.index.topProps(pkg, imported.substring(dot + 1)), source);
      return found != null ? found : typeBinding(name, at, source);
    }
    Binding same = single(ctx.index.topProps(source.pkg, name), source);
    if (same != null) {
      return same;
    }
    Binding star = null;
    for (String prefix : source.stars) {
      Binding candidate = single(ctx.index.topProps(prefix, name), source);
      if (candidate != null && star != null) {
        return Binding.UNKNOWN;
      }
      star = candidate != null ? candidate : star;
    }
    return star != null ? star : typeBinding(name, at, source);
  }

  private Binding single(List<Prop> props, Source source) {
    Prop found = null;
    for (Prop prop : props) {
      if (prop.isPrivate && prop.owner.source != source) {
        continue;
      }
      if (found != null) {
        return Binding.UNKNOWN;
      }
      found = prop;
    }
    return found == null ? null : Binding.field(found, false);
  }

  private Binding typeBinding(String name, PsiElement at, Source source) {
    Owner type = ctx.names.lookup(name, at, source);
    return type == null ? Binding.UNKNOWN : Binding.type(type);
  }

}
