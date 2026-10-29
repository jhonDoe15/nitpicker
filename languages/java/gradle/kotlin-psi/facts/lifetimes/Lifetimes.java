package nitpicker.kotlinpsi.facts.lifetimes;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.List;
import java.util.Map;
import java.util.function.IntUnaryOperator;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtNamedFunction;
import org.jetbrains.kotlin.psi.KtTryExpression;

public final class Lifetimes {
  private final Cleanups cleanups;
  private final UseBlocks useBlocks;

  public Lifetimes(KtFile file, IntUnaryOperator lines) {
    this.cleanups = new Cleanups(file, lines);
    this.useBlocks = new UseBlocks(file, lines);
  }

  public void tryExpression(KtTryExpression expression, Frame frame) {
    cleanups.tryExpression(expression, where(frame));
  }

  public boolean shieldsWholeBody(KtNamedFunction function) {
    return cleanups.shieldsWholeBody(function);
  }

  public void call(KtCallExpression call, Frame frame) {
    useBlocks.call(call, where(frame));
  }

  public List<Object> cleanupCalls() {
    return cleanups.calls;
  }

  public List<Object> useLaunches() {
    return useBlocks.launches;
  }

  private static Map<String, Object> where(Frame frame) {
    Frame function = frame == null ? null : frame.nearest("fun");
    Frame owner = frame == null ? null : frame.nearest("class");
    return m("owner", owner == null ? null : owner.data.get("qualified"),
        "function", function == null ? "<init>" : function.data.get("name"));
  }
}
