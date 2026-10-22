package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;
import java.util.regex.Pattern;
import javax.lang.model.element.Modifier;

final class TypeInfo {
  private static final Pattern VARARGS = Pattern.compile("\\.\\.\\.\\s*[\\w$]+\\s*$");

  final Unit unit;
  final ClassTree tree;
  final TypeInfo outer;
  final String simple;
  final String qualified;
  final String fqn;
  final String id;
  final Set<String> typeVars = new HashSet<>();
  final Map<String, TypeInfo> nested = new LinkedHashMap<>();
  final List<FieldInfo> fields = new ArrayList<>();
  final List<String> cases = new ArrayList<>();
  final List<MethodInfo> methods = new ArrayList<>();
  final List<TypeInfo> supers = new ArrayList<>();
  final List<String> externalSupers = new ArrayList<>();
  TypeInfo superclass;
  boolean linked;
  String designKind;
  boolean lombokData;
  boolean lombokPrivate;
  boolean lombokFinal;
  boolean lombokReplaceable;

  TypeInfo(Unit unit, ClassTree tree, TypeInfo outer) {
    this.unit = unit;
    this.tree = tree;
    this.outer = outer;
    this.simple = tree.getSimpleName().toString();
    this.qualified = outer == null ? simple : outer.qualified + "." + simple;
    this.fqn = outer == null ? (unit.pkg.isEmpty() ? simple : unit.pkg + "." + simple) : outer.fqn + "." + simple;
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
    if (isEnum() && variable.getInitializer() instanceof NewClassTree
        && variable.getType() != null
        && variable.getType().toString().equals(simple)) {
      cases.add(variable.getName().toString());
      return;
    }
    boolean isStatic = variable.getModifiers().getFlags().contains(Modifier.STATIC) || isInterface();
    fields.add(new FieldInfo(this, variable, isStatic));
    if (isRecord() && !isStatic) {
      components.add(new ParamInfo(variable.getName().toString(), variable.getType(), false));
    }
  }

  private MethodInfo readMethod(MethodTree method, List<ParamInfo> components) {
    List<ParamInfo> params = new ArrayList<>();
    for (VariableTree parameter : method.getParameters()) {
      params.add(new ParamInfo(parameter.getName().toString(), parameter.getType(), isVarargs(parameter)));
    }
    MethodInfo info = new MethodInfo(this, method, params);
    info.line = unit.line(method);
    if (isRecord() && info.ctor && params.isEmpty() && !components.isEmpty() && !delegates(method)) {
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

  Tree.Kind kind() {
    return tree.getKind();
  }

  boolean isInterface() {
    return kind() == Tree.Kind.INTERFACE || kind() == Tree.Kind.ANNOTATION_TYPE;
  }

  boolean isEnum() {
    return kind() == Tree.Kind.ENUM;
  }

  boolean isRecord() {
    return kind() == Tree.Kind.RECORD;
  }

  Set<Modifier> flags() {
    return tree.getModifiers().getFlags();
  }

  FieldInfo field(String name) {
    for (FieldInfo field : fields) {
      if (field.name.equals(name)) {
        return field;
      }
    }
    return null;
  }

  boolean hasExternalSuper() {
    return !externalSupers.isEmpty();
  }

  boolean exported() {
    boolean visible = flags().contains(Modifier.PUBLIC) || flags().contains(Modifier.PROTECTED);
    if (outer == null) {
      return flags().contains(Modifier.PUBLIC);
    }
    return outer.exported() && (visible || outer.isInterface());
  }
}
