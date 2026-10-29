package nitpicker.kotlinpsi.design.walk;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import nitpicker.kotlinpsi.design.collect.Uses;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.resolve.Arity;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

final class Arguments {
  private final Scope scope;
  private final Uses uses;
  private final Consumer<PsiElement> visitor;

  Arguments(Scope scope, Uses uses, Consumer<PsiElement> visitor) {
    this.scope = scope;
    this.uses = uses;
    this.visitor = visitor;
  }

  void forward(List<? extends ValueArgument> arguments, List<Arity.Arg> args, Fun target) {
    int[] mapping = target == null ? null : Arity.bind(target.params, args);
    for (int i = 0; i < arguments.size(); i++) {
      KtExpression expression = Ps.parens(arguments.get(i).getArgumentExpression());
      int index = expression instanceof KtNameReferenceExpression
          ? scope.parameterOf((KtNameReferenceExpression) expression)
          : -1;
      if (index < 0 || !uses.tracked(index)) {
        visitor.accept(expression);
      } else if (scope.escapes(expression) || mapping == null || arguments.get(i).getSpreadElement() != null) {
        uses.opaque(index);
      } else {
        uses.forward(index, target.id, mapping[i]);
      }
    }
  }

  static List<Arity.Arg> args(List<? extends ValueArgument> arguments) {
    List<Arity.Arg> args = new ArrayList<>();
    for (ValueArgument argument : arguments) {
      String name = argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString();
      args.add(new Arity.Arg(name, argument instanceof KtLambdaArgument, argument.getArgumentExpression()));
    }
    return args;
  }
}
