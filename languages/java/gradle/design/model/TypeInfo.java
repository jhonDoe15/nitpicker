package nitpicker.designfacts.model;

import com.sun.source.tree.*;
import java.util.*;
import java.util.regex.Pattern;
import javax.lang.model.element.Modifier;
import nitpicker.designfacts.Names;

public final class TypeInfo {
  private static final Pattern VARARGS = Pattern.compile("\\.\\.\\.\\s*[\\w$]+\\s*$");

  public final Unit unit;
  public final ClassTree tree;
  public final TypeInfo outer;
  public final String simple;
  public final String qualified;
  public final String fqn;
  public final String id;
  public final Set<String> typeVars = new HashSet<>();
  public final Map<String, TypeInfo> nested = new LinkedHashMap<>();
  public final List<FieldInfo> fields = new ArrayList<>();
  public final List<String> cases = new ArrayList<>();
  public final List<MethodInfo> methods = new ArrayList<>();
  public final List<TypeInfo> supers = new ArrayList<>();
  public final List<String> externalSupers = new ArrayList<>();
  public TypeInfo superclass;
  public boolean linked;
  public String designKind;
  public boolean lombokData;
  public boolean lombokPrivate;
  public boolean lombokFinal;
  public boolean lombokReplaceable;

  public TypeInfo(Unit unit, ClassTree tree, TypeInfo outer) {
    this.unit = unit;
    this.tree = tree;
    this.outer = outer;
    this.simple = tree.getSimpleName().toString();
    this.qualified = outer == null ? simple : outer.qualified + "." + simple;
    this.fqn = outer == null ? Names.qualify(unit.pkg, simple) : outer.fqn + "." + simple;
    this.id = unit.file + "#" + qualified;
    for (TypeParameterTree variable : tree.getTypeParameters()) {
      typeVars.add(variable.getName().toString());
    }
    readMembers();
  }

  private void readMembers() {
    List<ParamInfo> components = new ArrayList<>();
    for (Tree member : tree.getMembers()) {
      if (member instanceof VariableTree variable) {
        readField(variable, components);
      }
    }
    for (Tree member : tree.getMembers()) {
      if (member instanceof MethodTree method) {
        methods.add(readMethod(method, components));
      }
    }
  }

  private void readField(VariableTree variable, List<ParamInfo> components) {
    if (isEnum()
        && variable.getInitializer() instanceof NewClassTree
        && variable.getType() != null
        && variable.getType().toString().equals(simple)) {
      cases.add(variable.getName().toString());
      return;
    }
    boolean isStatic =
        variable.getModifiers().getFlags().contains(Modifier.STATIC) || isInterface();
    fields.add(new FieldInfo(this, variable, isStatic));
    if (isRecord() && !isStatic) {
      components.add(new ParamInfo(variable.getName().toString(), variable.getType(), false));
    }
  }

  private MethodInfo readMethod(MethodTree method, List<ParamInfo> components) {
    List<ParamInfo> params = new ArrayList<>();
    for (VariableTree parameter : method.getParameters()) {
      String name = parameter.getName().toString();
      params.add(new ParamInfo(name, parameter.getType(), isVarargs(parameter)));
    }
    MethodInfo info = new MethodInfo(this, method, params);
    info.line = unit.line(method);
    boolean compactCtor = info.ctor && params.isEmpty() && !components.isEmpty();
    if (isRecord() && compactCtor && !delegates(method)) {
      MethodInfo compact = new MethodInfo(this, method, List.copyOf(components));
      compact.compact = true;
      compact.line = info.line;
      return compact;
    }
    return info;
  }

  private boolean isVarargs(VariableTree parameter) {
    return VARARGS.matcher(unit.text(parameter)).find();
  }

  private static boolean delegates(MethodTree method) {
    if (method.getBody() == null || method.getBody().getStatements().isEmpty()) {
      return false;
    }
    return method.getBody().getStatements().get(0).toString().startsWith("this(");
  }

  public Tree.Kind kind() {
    return tree.getKind();
  }

  public boolean isInterface() {
    return kind() == Tree.Kind.INTERFACE || kind() == Tree.Kind.ANNOTATION_TYPE;
  }

  public boolean isEnum() {
    return kind() == Tree.Kind.ENUM;
  }

  public boolean isRecord() {
    return kind() == Tree.Kind.RECORD;
  }

  public Set<Modifier> flags() {
    return tree.getModifiers().getFlags();
  }

  public FieldInfo field(String name) {
    for (FieldInfo field : fields) {
      if (field.name.equals(name)) {
        return field;
      }
    }
    return null;
  }

  public boolean hasExternalSuper() {
    return !externalSupers.isEmpty();
  }

  public boolean declaresGetter(String name) {
    for (MethodInfo method : methods) {
      if (method.name.equals(name) && method.params.isEmpty()) {
        return true;
      }
    }
    return false;
  }

  public boolean exported() {
    boolean visible = flags().contains(Modifier.PUBLIC);
    return outer == null ? visible : outer.exported() && (visible || outer.isInterface());
  }
}
