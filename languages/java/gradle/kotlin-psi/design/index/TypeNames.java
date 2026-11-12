package nitpicker.kotlinpsi.design.index;

import java.util.ArrayList;
import java.util.List;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Source;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class TypeNames {
  private final Index index;

  public TypeNames(Index index) {
    this.index = index;
  }

  public Ty resolve(KtTypeReference reference, Source source) {
    if (reference == null) {
      return Ty.UNKNOWN;
    }
    KtTypeElement element = reference.getTypeElement();
    while (element instanceof KtNullableType) {
      element = ((KtNullableType) element).getInnerType();
    }
    List<String> parts = element instanceof KtUserType ? parts((KtUserType) element) : null;
    if (parts != null && !(parts.size() == 1 && typeParameter(parts.get(0), reference))) {
      Owner owner = chain(parts, reference, source);
      if (owner != null) {
        return Ty.of(owner);
      }
    }
    return Ty.text(Ps.typeText(reference));
  }

  private static List<String> parts(KtUserType type) {
    List<String> parts = new ArrayList<>();
    for (KtUserType part = type; part != null; part = part.getQualifier()) {
      if (part.getReferencedName() == null) {
        return null;
      }
      parts.add(0, part.getReferencedName());
    }
    return parts;
  }

  public Owner chain(List<String> parts, PsiElement at, Source source) {
    Owner current = lookup(parts.get(0), at, source);
    if (current == null) {
      return parts.size() > 1 ? index.type(String.join(".", parts)) : null;
    }
    for (String part : parts.subList(1, parts.size())) {
      current = current.nested.get(part);
      if (current == null) {
        return null;
      }
    }
    return current;
  }

  public Owner lookup(String name, PsiElement at, Source source) {
    for (PsiElement p = at; p != null; p = p.getParent()) {
      Owner found = enclosingNamed(p, name);
      if (found != null) {
        return found;
      }
    }
    return imported(name, source);
  }

  private Owner imported(String name, Source source) {
    String imported = source.imports.get(name);
    if (imported != null) {
      return index.type(imported);
    }
    Owner samePackage = index.type(source.pkg.isEmpty() ? name : source.pkg + "." + name);
    if (samePackage != null) {
      return samePackage;
    }
    Owner found = null;
    for (String star : source.stars) {
      Owner candidate = index.type(star + "." + name);
      if (candidate != null && found != null && found != candidate) {
        return null;
      }
      found = candidate != null ? candidate : found;
    }
    return found;
  }

  private Owner enclosingNamed(PsiElement p, String name) {
    Owner enclosing = p instanceof KtClassOrObject ? index.byPsi.get(p) : null;
    if (enclosing == null) {
      return null;
    }
    return enclosing.name.equals(name) ? enclosing : enclosing.nested.get(name);
  }

  public boolean typeParameter(String name, PsiElement at) {
    for (PsiElement p = at; p != null; p = p.getParent()) {
      if (p instanceof KtTypeParameterListOwner && declares((KtTypeParameterListOwner) p, name)) {
        return true;
      }
    }
    return false;
  }

  private static boolean declares(KtTypeParameterListOwner owner, String name) {
    for (KtTypeParameter parameter : owner.getTypeParameters()) {
      if (name.equals(parameter.getName())) {
        return true;
      }
    }
    return false;
  }
}
