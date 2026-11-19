package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.tools.javac.code.Flags;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import javax.lang.model.element.ElementKind;
import javax.lang.model.type.TypeKind;

/** Types whose methods may reach state the check cannot see: anything but plain values and data holders. */
final class OpaqueTypes {
  private static final Set<String> VALUE_PACKAGES = Set.of(
      "java.lang", "java.util", "java.util.stream", "java.time", "java.time.temporal", "java.time.format",
      "java.time.chrono", "java.time.zone", "java.math", "java.text", "java.util.regex");
  private static final Set<String> ACTING = Set.of(
      "java.lang.Thread", "java.lang.Runtime", "java.lang.Process", "java.lang.ProcessBuilder",
      "java.lang.ClassLoader", "java.lang.AutoCloseable", "java.util.Timer", "java.util.ServiceLoader");
  private static final List<String> LOGGERS = List.of(
      "org.slf4j.Logger", "java.util.logging.Logger", "java.lang.System.Logger", "org.apache.logging.log4j.Logger",
      "org.apache.commons.logging.Log");
  private static final int MAX_TYPES = 40;

  private OpaqueTypes() {}

  static boolean opaque(Type type, VisitorState state) {
    return opaque(type, state, new HashSet<>());
  }

  private static boolean opaque(Type type, VisitorState state, Set<Symbol> seen) {
    if (type == null || type.isPrimitive()) {
      return false;
    }
    if (type.getKind() == TypeKind.ARRAY) {
      return opaque(((Type.ArrayType) type).getComponentType(), state, seen);
    }
    Type erased = state.getTypes().erasure(type);
    if (erased.getKind() != TypeKind.DECLARED || !(erased.tsym instanceof Symbol.ClassSymbol symbol)) {
      return true;
    }
    if (!seen.add(symbol)) {
      return false;
    }
    if (seen.size() > MAX_TYPES) {
      return true;
    }
    if (symbol.getKind() == ElementKind.ENUM || isAny(erased, LOGGERS, state)) {
      return false;
    }
    String owner = symbol.packge().getQualifiedName().toString();
    if (owner.startsWith("java.") || owner.startsWith("javax.") || owner.startsWith("jakarta.")) {
      return !VALUE_PACKAGES.contains(owner) || isAny(erased, List.copyOf(ACTING), state)
          || ASTHelpers.hasAnnotation(symbol, "java.lang.FunctionalInterface", state);
    }
    if (symbol.isInterface() || (symbol.flags() & Flags.ABSTRACT) != 0) {
      return true;
    }
    return holdsOpaque(erased, state, seen);
  }

  private static boolean holdsOpaque(Type holder, VisitorState state, Set<Symbol> seen) {
    for (Type current = holder; current != null && current.tsym instanceof Symbol.ClassSymbol symbol;
        current = state.getTypes().supertype(current)) {
      String owner = symbol.packge().getQualifiedName().toString();
      if (owner.startsWith("java.")) {
        return current != holder && !symbol.getQualifiedName().contentEquals("java.lang.Object")
            && !symbol.getQualifiedName().contentEquals("java.lang.Record") && opaque(current, state, seen);
      }
      for (Symbol member : symbol.members().getSymbols()) {
        if (member instanceof Symbol.VarSymbol field && opaque(field.type, state, seen)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean isAny(Type type, List<String> names, VisitorState state) {
    for (String name : names) {
      Type wanted = state.getTypeFromString(name);
      if (wanted != null && ASTHelpers.isSubtype(type, state.getTypes().erasure(wanted), state)) {
        return true;
      }
    }
    return false;
  }
}
