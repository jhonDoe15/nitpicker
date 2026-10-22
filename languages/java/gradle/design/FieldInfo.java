package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;

final class FieldInfo {
  final TypeInfo owner;
  final String name;
  final VariableTree tree;
  final boolean isStatic;

  FieldInfo(TypeInfo owner, VariableTree tree, boolean isStatic) {
    this.owner = owner;
    this.name = tree.getName().toString();
    this.tree = tree;
    this.isStatic = isStatic;
  }

  Set<Modifier> flags() {
    return tree.getModifiers().getFlags();
  }

  boolean isPrivate() {
    return flags().contains(Modifier.PRIVATE) || owner.isRecord() || owner.lombokPrivate;
  }

  boolean isFinal() {
    return flags().contains(Modifier.FINAL) || owner.isRecord() || owner.lombokFinal;
  }
}
