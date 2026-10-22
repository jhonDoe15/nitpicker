package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;

final class MethodInfo {
  final TypeInfo owner;
  final MethodTree tree;
  final String name;
  final boolean ctor;
  final boolean isStatic;
  final List<ParamInfo> params;
  final Tree returnType;
  final Set<String> typeVars = new HashSet<>();
  final Set<Modifier> flags;
  String id;
  String accessorField;
  String lombokField;
  boolean compact;
  int line;

  MethodInfo(TypeInfo owner, MethodTree tree, List<ParamInfo> params) {
    this.owner = owner;
    this.tree = tree;
    this.name = tree.getName().toString();
    this.ctor = name.equals("<init>");
    this.flags = tree.getModifiers().getFlags();
    this.isStatic = flags.contains(Modifier.STATIC);
    this.params = params;
    this.returnType = tree.getReturnType();
    for (TypeParameterTree variable : tree.getTypeParameters()) {
      typeVars.add(variable.getName().toString());
    }
  }

  MethodInfo(
      TypeInfo owner, String name, Tree returnType, String field, Set<Modifier> flags, int line) {
    this.owner = owner;
    this.tree = null;
    this.name = name;
    this.ctor = false;
    this.isStatic = false;
    this.params = List.of();
    this.returnType = returnType;
    this.flags = flags;
    this.lombokField = field;
    this.accessorField = field;
    this.line = line;
  }

  boolean hasBody() {
    return tree == null || tree.getBody() != null;
  }

  boolean isVarargs() {
    return !params.isEmpty() && params.get(params.size() - 1).varargs;
  }

  boolean accepts(int argc) {
    return params.size() == argc || (isVarargs() && argc >= params.size() - 1);
  }

  String displayName() {
    return ctor ? owner.simple : name;
  }
}
