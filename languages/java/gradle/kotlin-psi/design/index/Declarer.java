package nitpicker.kotlinpsi.design.index;

import java.util.ArrayList;
import java.util.List;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.syntax.Mutables;
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
      aliasAccessors(owner);
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
    Prop prop = property(index.module(source), declaration);
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
    String qname = outer == null ? name : outer.qname + "." + name;
    Owner owner = new Owner(source.path + "#" + qname, name, qname, source, klass, outer);
    owner.exported = !Ps.isPrivate(klass) && (outer == null || outer.exported);
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
    List<String> cases = new ArrayList<>();
    for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
      if (parameter.hasValOrVar() && parameter.getName() != null) {
        constructorProperty(owner, parameter);
      }
    }
    for (KtDeclaration declaration : klass.getDeclarations()) {
      if (declaration instanceof KtEnumEntry) {
        cases.add(declaration.getName());
      } else if (declaration instanceof KtNamedFunction) {
        owner.funs.add(function(owner, Fun.METHOD, (KtNamedFunction) declaration));
      } else if (declaration instanceof KtProperty) {
        property(owner, (KtProperty) declaration);
      } else if (declaration instanceof KtSecondaryConstructor) {
        owner.constructors.add(secondary(owner, (KtSecondaryConstructor) declaration));
      } else if (declaration instanceof KtClassOrObject) {
        type((KtClassOrObject) declaration, owner, source);
      }
    }
    if (klass instanceof KtClass && ((KtClass) klass).isEnum()) {
      owner.cases = cases;
    }
    primary(owner, klass);
  }

  private Fun function(Owner owner, String kind, KtNamedFunction declaration) {
    Fun.Shape shape = new Fun.Shape();
    shape.params = declaration.getValueParameters();
    shape.receiver = declaration.getReceiverTypeReference();
    shape.returns = declaration.getTypeReference();
    shape.isPrivate = Ps.isPrivate(declaration);
    shape.isOverride = declaration.hasModifier(KtTokens.OVERRIDE_KEYWORD);
    shape.hasBody = declaration.hasBody();
    Fun function = new Fun(declaration.getName(), owner, kind, declaration, shape);
    if (declaration.getBodyExpression() != null) {
      function.roots.add(declaration.getBodyExpression());
    }
    return function;
  }

  private Fun secondary(Owner owner, KtSecondaryConstructor declaration) {
    Fun.Shape shape = new Fun.Shape();
    shape.params = declaration.getValueParameters();
    shape.isPrivate = Ps.isPrivate(declaration);
    shape.hasBody = true;
    Fun function = new Fun(owner.name, owner, Fun.CONSTRUCTOR, declaration, shape);
    if (!declaration.hasImplicitDelegationCall()) {
      function.roots.add(declaration.getDelegationCall());
    }
    if (declaration.getBodyExpression() != null) {
      function.roots.add(declaration.getBodyExpression());
    }
    return function;
  }

  private void primary(Owner owner, KtClassOrObject klass) {
    boolean plain = klass instanceof KtClass && !((KtClass) klass).isData() && !((KtClass) klass).isEnum()
        && !((KtClass) klass).isInterface();
    if (!plain) {
      return;
    }
    List<PsiElement> roots = new ArrayList<>();
    for (KtDeclaration declaration : klass.getDeclarations()) {
      if (declaration instanceof KtClassInitializer) {
        roots.add(((KtClassInitializer) declaration).getBody());
      } else if (declaration instanceof KtProperty && ((KtProperty) declaration).getReceiverTypeReference() == null) {
        addIfPresent(roots, ((KtProperty) declaration).getInitializer());
        addIfPresent(roots, ((KtProperty) declaration).getDelegateExpression());
      }
    }
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      if (entry instanceof KtSuperTypeCallEntry) {
        roots.add(entry);
      }
    }
    boolean explicit = klass.getPrimaryConstructor() != null && !klass.getPrimaryConstructorParameters().isEmpty();
    boolean active = roots.stream().anyMatch(root -> PsiTreeUtil.findChildOfType(root, KtCallExpression.class) != null
        || root instanceof KtBlockExpression);
    if (!explicit && !active) {
      return;
    }
    Fun.Shape shape = new Fun.Shape();
    shape.params = klass.getPrimaryConstructorParameters();
    shape.isPrivate = klass.getPrimaryConstructor() != null && Ps.isPrivate(klass.getPrimaryConstructor());
    shape.hasBody = true;
    Fun constructor = new Fun(owner.name, owner, Fun.CONSTRUCTOR, klass, shape);
    constructor.roots.addAll(roots);
    owner.constructors.add(constructor);
  }

  private void addIfPresent(List<PsiElement> roots, PsiElement element) {
    if (element != null) {
      roots.add(element);
    }
  }

  private void constructorProperty(Owner owner, KtParameter parameter) {
    Prop.Shape shape = new Prop.Shape();
    shape.type = parameter.getTypeReference();
    shape.isVar = parameter.isMutable();
    shape.isPrivate = Ps.isPrivate(parameter);
    shape.field = true;
    shape.constructorParameter = true;
    owner.props.put(parameter.getName(), new Prop(parameter.getName(), owner, parameter, shape));
  }

  private Prop property(Owner owner, KtProperty declaration) {
    if (declaration.getName() == null || declaration.getReceiverTypeReference() != null) {
      return null;
    }
    boolean computed = declaration.getAccessors().stream().anyMatch(KtPropertyAccessor::hasBody);
    boolean abstractOwner = owner.psi instanceof KtClass && ((KtClass) owner.psi).isInterface();
    Prop.Shape shape = new Prop.Shape();
    shape.type = declaration.getTypeReference();
    shape.init = declaration.getInitializer();
    shape.isVar = declaration.isVar();
    shape.isPrivate = Ps.isPrivate(declaration);
    shape.delegated = declaration.hasDelegate();
    shape.field = !abstractOwner && !declaration.hasModifier(KtTokens.ABSTRACT_KEYWORD)
        && !declaration.hasModifier(KtTokens.CONST_KEYWORD)
        && (declaration.hasInitializer() || declaration.hasDelegate()
            || declaration.hasModifier(KtTokens.LATEINIT_KEYWORD) || !computed);
    Prop prop = new Prop(declaration.getName(), owner, declaration, shape);
    owner.props.put(prop.name, prop);
    accessor(owner, prop, declaration);
    return prop;
  }

  private void accessor(Owner owner, Prop prop, KtProperty declaration) {
    KtPropertyAccessor getter = declaration.getGetter();
    Fun.Shape shape = new Fun.Shape();
    shape.returns = declaration.getTypeReference();
    shape.isOverride = declaration.hasModifier(KtTokens.OVERRIDE_KEYWORD);
    shape.hasBody = true;
    if (getter != null && getter.hasBody()) {
      shape.isPrivate = prop.isPrivate || Ps.isPrivate(getter);
      Fun function = new Fun(prop.name, owner, Fun.ACCESSOR, getter, shape);
      function.roots.add(getter.getBodyExpression());
      link(owner, prop, function);
    } else if (!prop.isPrivate && !prop.isVar && prop.field && !prop.constructorParameter
        && Mutables.created(prop.init) && !Mutables.readOnlyType(prop.type)) {
      Fun function = new Fun(prop.name, owner, Fun.ACCESSOR, declaration, shape);
      function.returnsField = prop.name;
      link(owner, prop, function);
    }
  }

  private void link(Owner owner, Prop prop, Fun function) {
    function.property = prop;
    prop.getter = function;
    owner.funs.add(function);
  }

  private void aliasAccessors(Owner owner) {
    for (Prop prop : new ArrayList<>(owner.props.values())) {
      if (prop.getter != null || prop.isPrivate || prop.isVar || prop.constructorParameter || prop.init == null) {
        continue;
      }
      String target = fieldName(prop.init);
      Prop backing = target == null ? null : owner.props.get(target);
      if (backing != null && backing != prop && !backing.isVar && backing.field && !backing.constructorParameter
          && Mutables.created(backing.init) && prop.psi instanceof KtProperty) {
        Fun.Shape shape = new Fun.Shape();
        shape.returns = prop.type;
        shape.hasBody = true;
        Fun function = new Fun(prop.name, owner, Fun.ACCESSOR, (KtProperty) prop.psi, shape);
        function.returnsField = backing.name;
        link(owner, prop, function);
      }
    }
  }

  private String fieldName(KtExpression initializer) {
    KtExpression expression = Ps.strip(initializer);
    if (expression instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) expression).getReceiverExpression() instanceof KtThisExpression) {
      expression = ((KtDotQualifiedExpression) expression).getSelectorExpression();
    }
    return expression instanceof KtNameReferenceExpression
        ? ((KtNameReferenceExpression) expression).getReferencedName()
        : null;
  }
}
