package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.tools.javac.code.Flags;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import com.sun.tools.javac.code.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.lang.model.type.TypeKind;

final class RepositoryCalls {
  enum Form {
    OPTIONAL,
    NULLABLE,
    COUNT
  }

  private static final String REPOSITORY = "org.springframework.data.repository.Repository";
  private static final Pattern SUBJECT = Pattern.compile("^(?:\\p{Lu}\\w*?)??By(\\p{Lu}\\w*)$");
  private static final Pattern VERBATIM = Pattern.compile("^(?:Distinct|First|Top)|OrderBy");
  private static final Set<String> HARMLESS = Set.of("EntityGraph", "Lock", "QueryHints", "QueryHint");

  private RepositoryCalls() {}

  static String existence(MethodInvocationTree call, Form form, VisitorState state) {
    if (!(call.getMethodSelect() instanceof MemberSelectTree select) || call.getArguments().isEmpty()) {
      return null;
    }
    Type receiver = ASTHelpers.getType(select.getExpression());
    Symbol.MethodSymbol method = ASTHelpers.getSymbol(call);
    Type repository = state.getTypeFromString(REPOSITORY);
    if (receiver == null
        || method == null
        || repository == null
        || !isRepositoryInterface(receiver, repository, state)
        || !isPlainDeclaration(method, repository, state)
        || !returnsExpected(receiver, method, form, repository, state)) {
      return null;
    }
    String name = counterpartName(method.getSimpleName().toString(), form);
    if (name == null || !hasAcceptingCounterpart(receiver, method, name, repository, state)) {
      return null;
    }
    List<? extends ExpressionTree> arguments = call.getArguments();
    String argumentText =
        state
            .getSourceCode()
            .subSequence(
                Support.start(arguments.get(0)), Support.end(arguments.get(arguments.size() - 1), state))
            .toString();
    return Support.source(select.getExpression(), state) + "." + name + "(" + argumentText + ")";
  }

  private static boolean isRepositoryInterface(Type type, Type repository, VisitorState state) {
    Types types = state.getTypes();
    return type.tsym instanceof Symbol.ClassSymbol owner
        && owner.isInterface()
        && types.isSubtype(types.erasure(type), types.erasure(repository));
  }

  private static boolean isPlainDeclaration(Symbol.MethodSymbol method, Type repository, VisitorState state) {
    Types types = state.getTypes();
    return method.owner instanceof Symbol.ClassSymbol owner
        && owner.isInterface()
        && types.isSubtype(types.erasure(owner.type), types.erasure(repository))
        && (method.flags() & (Flags.DEFAULT | Flags.STATIC)) == 0
        && !queried(method);
  }

  private static boolean queried(Symbol.MethodSymbol method) {
    for (var annotation : method.getAnnotationMirrors()) {
      Symbol type = annotation.type.tsym;
      if (declaredByData(type)) {
        return true;
      }
      for (var meta : type.getAnnotationMirrors()) {
        if (declaredByData(meta.type.tsym)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean declaredByData(Symbol type) {
    return type.getQualifiedName().toString().startsWith("org.springframework.data.")
        && !HARMLESS.contains(type.getSimpleName().toString());
  }

  private static boolean returnsExpected(
      Type receiver, Symbol.MethodSymbol method, Form form, Type repository, VisitorState state) {
    Types types = state.getTypes();
    Type returned = types.memberType(receiver, method).getReturnType();
    if (form == Form.OPTIONAL) {
      Type optional = state.getTypeFromString("java.util.Optional");
      return optional != null && types.isSameType(types.erasure(returned), types.erasure(optional));
    }
    if (form == Form.COUNT) {
      return returned.getKind() == TypeKind.LONG || returned.getKind() == TypeKind.INT;
    }
    Type declared = types.asSuper(receiver, repository.tsym);
    if (declared == null || declared.getTypeArguments().isEmpty() || returned.isPrimitive()) {
      return false;
    }
    return types.isSubtype(types.erasure(returned), types.erasure(declared.getTypeArguments().get(0)));
  }

  private static String counterpartName(String name, Form form) {
    String verb = form == Form.COUNT ? "count" : "find";
    if (!name.startsWith(verb)) {
      return null;
    }
    String rest = name.substring(verb.length());
    if (VERBATIM.matcher(rest).find()) {
      return "exists" + rest;
    }
    Matcher subject = SUBJECT.matcher(rest);
    return subject.matches() ? "existsBy" + subject.group(1) : null;
  }

  private static boolean hasAcceptingCounterpart(
      Type receiver, Symbol.MethodSymbol method, String name, Type repository, VisitorState state) {
    Types types = state.getTypes();
    List<Type> parameters = types.memberType(receiver, method).getParameterTypes();
    List<Symbol.MethodSymbol> accepted = new ArrayList<>();
    for (Type supertype : types.closure(receiver)) {
      for (Symbol member : supertype.tsym.members().getSymbolsByName(state.getName(name))) {
        if (member instanceof Symbol.MethodSymbol candidate
            && isPlainDeclaration(candidate, repository, state)
            && accepts(types.memberType(receiver, candidate), parameters, types)
            && accepted.stream().noneMatch(seen -> overrides(seen, candidate, receiver, types))) {
          accepted.add(candidate);
        }
      }
    }
    return accepted.size() == 1;
  }

  private static boolean overrides(
      Symbol.MethodSymbol first, Symbol.MethodSymbol second, Type receiver, Types types) {
    return first.overrides(second, receiver.tsym, types, false)
        || second.overrides(first, receiver.tsym, types, false);
  }

  private static boolean accepts(Type candidate, List<Type> parameters, Types types) {
    List<Type> expected = candidate.getParameterTypes();
    if (expected.size() != parameters.size() || candidate.getReturnType().getKind() != TypeKind.BOOLEAN) {
      return false;
    }
    for (int index = 0; index < expected.size(); index++) {
      if (!types.isAssignable(parameters.get(index), expected.get(index))) {
        return false;
      }
    }
    return true;
  }
}
