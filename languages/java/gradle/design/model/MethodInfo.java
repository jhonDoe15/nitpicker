package nitpicker.designfacts.model;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;

public final class MethodInfo {
  public final TypeInfo owner;
  public final MethodTree tree;
  public final String name;
  public final boolean ctor;
  public final boolean isStatic;
  public final List<ParamInfo> params;
  public final Tree returnType;
  public final Set<String> typeVars = new HashSet<>();
  public final Set<Modifier> flags;
  public String id;
  public String accessorField;
  public String lombokField;
  public boolean compact;
  public int line;

  public MethodInfo(TypeInfo owner, MethodTree tree, List<ParamInfo> params) {
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

  public record Getter(String name, Tree returnType, String field, Set<Modifier> flags, int line) {}

  public MethodInfo(TypeInfo owner, Getter getter) {
    this.owner = owner;
    this.tree = null;
    this.name = getter.name();
    this.ctor = false;
    this.isStatic = false;
    this.params = List.of();
    this.returnType = getter.returnType();
    this.flags = getter.flags();
    this.lombokField = getter.field();
    this.accessorField = getter.field();
    this.line = getter.line();
  }

  public boolean hasBody() {
    return tree == null || tree.getBody() != null;
  }

  public boolean isVarargs() {
    return !params.isEmpty() && params.get(params.size() - 1).varargs;
  }

  public boolean accepts(int argc) {
    return params.size() == argc || (isVarargs() && argc >= params.size() - 1);
  }

  public String displayName() {
    return ctor ? owner.simple : name;
  }
}
