package nitpicker.kotlinpsi.design.index;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.kotlinpsi.design.model.Owner;
import nitpicker.kotlinpsi.design.model.Ty;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Hierarchy {
  private final TypeNames names;
  private final Map<Owner, List<Owner>> supers = new IdentityHashMap<>();
  private final Map<Owner, Boolean> external = new IdentityHashMap<>();
  private final Map<Owner, List<Owner>> chains = new HashMap<>();

  public Hierarchy(TypeNames names, Index index) {
    this.names = names;
    link(index);
  }

  public List<Owner> supers(Owner owner) {
    List<Owner> found = supers.get(owner);
    if (found == null) {
      resolve(owner);
      found = supers.get(owner);
    }
    return found;
  }

  public boolean external(Owner owner) {
    supers(owner);
    return external.get(owner);
  }

  public List<Owner> ancestors(Owner owner) {
    List<Owner> cached = chains.get(owner);
    if (cached != null) {
      return cached;
    }
    Set<Owner> seen = new LinkedHashSet<>();
    List<Owner> queue = new ArrayList<>(List.of(owner));
    for (int i = 0; i < queue.size(); i++) {
      if (seen.add(queue.get(i))) {
        queue.addAll(supers(queue.get(i)));
      }
    }
    List<Owner> result = new ArrayList<>(seen);
    chains.put(owner, result);
    return result;
  }

  public boolean subtype(Owner sub, Owner sup) {
    return ancestors(sub).contains(sup);
  }

  private void resolve(Owner owner) {
    List<Owner> project = new ArrayList<>();
    boolean outside = false;
    supers.put(owner, project);
    List<KtSuperTypeListEntry> entries = owner.psi == null ? List.of() : owner.psi.getSuperTypeListEntries();
    for (KtSuperTypeListEntry entry : entries) {
      Ty type = names.resolve(entry.getTypeReference(), owner.source);
      if (type.project()) {
        project.add(type.owner);
      }
      outside |= !type.project();
    }
    external.put(owner, outside);
  }

  private void link(Index index) {
    Map<Owner, List<Owner>> subs = new IdentityHashMap<>();
    for (Owner owner : index.owners) {
      for (Owner parent : supers(owner)) {
        subs.computeIfAbsent(parent, key -> new ArrayList<>()).add(owner);
      }
    }
    for (Map.Entry<Owner, List<Owner>> entry : subs.entrySet()) {
      Owner sealed = entry.getKey();
      if (sealed.psi != null && sealed.psi.hasModifier(KtTokens.SEALED_KEYWORD) && allCases(entry.getValue())) {
        markCases(sealed, entry.getValue());
      }
    }
  }

  private void markCases(Owner sealed, List<Owner> subs) {
    List<String> cases = new ArrayList<>();
    for (Owner sub : subs) {
      cases.add(sub.name);
      sub.caseOf = sealed;
      sub.listed = false;
    }
    sealed.cases = cases;
  }

  private boolean allCases(List<Owner> subs) {
    for (Owner sub : subs) {
      boolean object = sub.psi instanceof KtObjectDeclaration && !((KtObjectDeclaration) sub.psi).isCompanion();
      if (!object || !sub.psi.getDeclarations().isEmpty() || sub.psi.getPrimaryConstructor() != null) {
        return false;
      }
    }
    return true;
  }
}
