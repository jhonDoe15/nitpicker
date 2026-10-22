package nitpicker.kotlinpsi.design;

import java.util.ArrayList;
import java.util.List;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class TypeNames {
  private final Index index;

  TypeNames(Index index) {
    this.index = index;
  }

  Ty resolve(KtTypeReference reference, Source source) {
    if (reference == null) {
      return Ty.UNKNOWN;
    }
    KtTypeElement element = reference.getTypeElement();
    while (element instanceof KtNullableType) {
      element = ((KtNullableType) element).getInnerType();
    }
    if (element instanceof KtUserType) {
      List<String> parts = new ArrayList<>();
      for (KtUserType part = (KtUserType) element; part != null; part = part.getQualifier()) {
        if (part.getReferencedName() == null) {
          return Ty.text(Ps.typeText(reference));
        }
        parts.add(0, part.getReferencedName());
      }
      if (parts.size() == 1 && typeParameter(parts.get(0), reference)) {
        return Ty.text(Ps.typeText(reference));
      }
      Owner owner = chain(parts, reference, source);
      if (owner != null) {
        return Ty.of(owner);
      }
    }
    return Ty.text(Ps.typeText(reference));
  }

  Owner chain(List<String> parts, PsiElement at, Source source) {
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

  Owner lookup(String name, PsiElement at, Source source) {
    for (PsiElement p = at; p != null; p = p.getParent()) {
      Owner enclosing = p instanceof KtClassOrObject ? index.byPsi.get(p) : null;
      if (enclosing != null) {
        Owner found = enclosing.name.equals(name) ? enclosing : enclosing.nested.get(name);
        if (found != null) {
          return found;
        }
      }
    }
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

  boolean typeParameter(String name, PsiElement at) {
    for (PsiElement p = at; p != null; p = p.getParent()) {
      if (p instanceof KtTypeParameterListOwner) {
        for (KtTypeParameter parameter : ((KtTypeParameterListOwner) p).getTypeParameters()) {
          if (name.equals(parameter.getName())) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
