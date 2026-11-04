package nitpicker.kotlinpsi.design.index;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import nitpicker.kotlinpsi.design.declare.Properties;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Declarer {
  private final Index index;

  public Declarer(Index index) {
    this.index = index;
  }

  public void run() {
    for (Source source : index.sources) {
      declareFile(source);
    }
    for (Owner owner : new ArrayList<>(index.owners)) {
      Properties.aliasAccessors(owner);
    }
  }

  private void declareFile(Source source) {
    for (KtDeclaration declaration : source.psi.getDeclarations()) {
      if (declaration instanceof KtClassOrObject) {
        type((KtClassOrObject) declaration, null, source);
      } else if (declaration instanceof KtNamedFunction) {
        topFunction(source, (KtNamedFunction) declaration);
      } else if (declaration instanceof KtProperty && ((KtProperty) declaration).getReceiverTypeReference() == null) {
        topProperty(source, (KtProperty) declaration);
      }
    }
  }

  private void topFunction(Source source, KtNamedFunction declaration) {
    Owner module = index.module(source);
    Fun function = function(module, Fun.FUNCTION, declaration);
    module.funs.add(function);
    index.addTop(source, function);
  }

  private void topProperty(Source source, KtProperty declaration) {
    Prop prop = Properties.property(index.module(source), declaration);
    if (prop != null) {
      index.addTop(source, prop);
    }
  }

  private void type(KtClassOrObject klass, Owner outer, Source source) {
    boolean literal = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isObjectLiteral();
    boolean annotation = klass instanceof KtClass && ((KtClass) klass).isAnnotation();
    if (klass instanceof KtEnumEntry || klass.isLocal() || literal || annotation) {
      return;
    }
    boolean companion = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion();
    String name = klass.getName() != null ? klass.getName() : "Companion";
    Owner owner = new Owner(new Owner.Place(source, outer), name, klass);
    owner.exported = !Ps.hidden(klass) && (outer == null || outer.exported);
    index.register(owner);
    if (outer != null) {
      outer.nested.put(name, owner);
      if (companion) {
        outer.companion = owner;
      }
    }
    members(owner, klass, source);
  }

  private void members(Owner owner, KtClassOrObject klass, Source source) {
    for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
      if (parameter.hasValOrVar() && parameter.getName() != null) {
        Properties.constructorProperty(owner, parameter);
      }
    }
    for (KtDeclaration declaration : klass.getDeclarations()) {
      member(owner, declaration, source);
    }
    primary(owner, klass);
  }

  private void member(Owner owner, KtDeclaration declaration, Source source) {
    if (declaration instanceof KtEnumEntry) {
      owner.cases = Stream.concat(owner.cases.stream(), Stream.of(declaration.getName())).toList();
    } else if (declaration instanceof KtNamedFunction) {
      owner.funs.add(function(owner, Fun.METHOD, (KtNamedFunction) declaration));
    } else if (declaration instanceof KtProperty) {
      Properties.property(owner, (KtProperty) declaration);
    } else if (declaration instanceof KtSecondaryConstructor) {
      owner.constructors.add(secondary(owner, (KtSecondaryConstructor) declaration));
    } else if (declaration instanceof KtClassOrObject) {
      type((KtClassOrObject) declaration, owner, source);
    }
  }

  private Fun function(Owner owner, String kind, KtNamedFunction declaration) {
    Fun.Shape shape = new Fun.Shape();
    shape.params = declaration.getValueParameters();
    shape.receiver = declaration.getReceiverTypeReference();
    shape.returns = declaration.getTypeReference();
    shape.isPrivate = Ps.isPrivate(declaration);
    shape.isProtected = Ps.isProtected(declaration);
    shape.isOverride = declaration.hasModifier(KtTokens.OVERRIDE_KEYWORD);
    shape.hasBody = declaration.hasBody();
    Fun function = new Fun(owner, declaration, shape.named(declaration.getName(), kind));
    if (declaration.getBodyExpression() != null) {
      function.roots.add(declaration.getBodyExpression());
    }
    return function;
  }

  private Fun secondary(Owner owner, KtSecondaryConstructor declaration) {
    Fun.Shape shape = new Fun.Shape();
    shape.params = declaration.getValueParameters();
    shape.isPrivate = Ps.isPrivate(declaration);
    shape.isProtected = Ps.isProtected(declaration);
    shape.hasBody = true;
    Fun function = new Fun(owner, declaration, shape.named(owner.name, Fun.CONSTRUCTOR));
    if (!declaration.hasImplicitDelegationCall()) {
      function.roots.add(declaration.getDelegationCall());
    }
    if (declaration.getBodyExpression() != null) {
      function.roots.add(declaration.getBodyExpression());
    }
    return function;
  }

  private boolean plain(KtClassOrObject klass) {
    if (!(klass instanceof KtClass)) {
      return false;
    }
    KtClass type = (KtClass) klass;
    return !type.isData() && !type.isEnum() && !type.isInterface();
  }

  private void primary(Owner owner, KtClassOrObject klass) {
    if (!plain(klass)) {
      return;
    }
    List<PsiElement> roots = initializerRoots(klass);
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      if (entry instanceof KtSuperTypeCallEntry) {
        roots.add(entry);
      }
    }
    boolean explicit = klass.getPrimaryConstructor() != null && !klass.getPrimaryConstructorParameters().isEmpty();
    if (explicit || active(roots)) {
      owner.constructors.add(primaryConstructor(owner, klass, roots));
    }
  }

  private boolean active(List<PsiElement> roots) {
    return roots.stream().anyMatch(root -> PsiTreeUtil.findChildOfType(root, KtCallExpression.class) != null
        || root instanceof KtBlockExpression);
  }

  private List<PsiElement> initializerRoots(KtClassOrObject klass) {
    List<PsiElement> roots = new ArrayList<>();
    for (KtDeclaration declaration : klass.getDeclarations()) {
      if (declaration instanceof KtClassInitializer) {
        roots.add(((KtClassInitializer) declaration).getBody());
      } else if (declaration instanceof KtProperty && ((KtProperty) declaration).getReceiverTypeReference() == null) {
        addIfPresent(roots, ((KtProperty) declaration).getInitializer());
        addIfPresent(roots, ((KtProperty) declaration).getDelegateExpression());
      }
    }
    return roots;
  }

  private Fun primaryConstructor(Owner owner, KtClassOrObject klass, List<PsiElement> roots) {
    KtPrimaryConstructor declared = klass.getPrimaryConstructor();
    Fun.Shape shape = new Fun.Shape();
    shape.params = klass.getPrimaryConstructorParameters();
    shape.isPrivate = declared != null && Ps.isPrivate(declared);
    shape.isProtected = declared != null && Ps.isProtected(declared);
    shape.hasBody = true;
    Fun constructor = new Fun(owner, klass, shape.named(owner.name, Fun.CONSTRUCTOR));
    constructor.roots.addAll(roots);
    return constructor;
  }

  private void addIfPresent(List<PsiElement> roots, PsiElement element) {
    if (element != null) {
      roots.add(element);
    }
  }
}
