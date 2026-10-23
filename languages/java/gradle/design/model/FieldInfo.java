package nitpicker.designfacts.model;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;

public final class FieldInfo {
  public final TypeInfo owner;
  public final String name;
  public final VariableTree tree;
  public final boolean isStatic;

  public FieldInfo(TypeInfo owner, VariableTree tree, boolean isStatic) {
    this.owner = owner;
    this.name = tree.getName().toString();
    this.tree = tree;
    this.isStatic = isStatic;
  }

  public Set<Modifier> flags() {
    return tree.getModifiers().getFlags();
  }

  public boolean isPrivate() {
    return flags().contains(Modifier.PRIVATE) || owner.isRecord() || owner.lombokPrivate;
  }

  public boolean isFinal() {
    return flags().contains(Modifier.FINAL) || owner.isRecord() || owner.lombokFinal;
  }
}
