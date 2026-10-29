package nitpicker.kotlinpsi.facts.locking;

import static nitpicker.kotlinpsi.common.Psi.annotationNames;
import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import java.util.function.IntUnaryOperator;
import nitpicker.kotlinpsi.common.Frame;
import nitpicker.kotlinpsi.facts.updates.Updates;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

public final class Locking {
  private static final Map<String, String> KNOWN = Map.of(
      "kotlin.synchronized", "synchronized", "kotlin.concurrent.withLock", "withLock",
      "kotlinx.coroutines.sync.withLock", "withLock");
  private static final Set<Object> ASSIGNMENTS = Set.of(KtTokens.EQ, KtTokens.PLUSEQ, KtTokens.MINUSEQ,
      KtTokens.MULTEQ, KtTokens.DIVEQ, KtTokens.PERCEQ);
  private static final Set<Object> STEPS = Set.of(KtTokens.PLUSPLUS, KtTokens.MINUSMINUS);

  private final IntUnaryOperator lineOf;
  private final List<Object> acquisitions = new ArrayList<>();
  private final List<Object> writes = new ArrayList<>();
  private final List<Object> lockedCalls = new ArrayList<>();
  private final Map<String, String> hosts =
      new TreeMap<>(Map.of("synchronized", "synchronized", "withLock", "withLock"));

  public Locking(KtFile file, IntUnaryOperator lineOf) {
    this.lineOf = lineOf;
    for (KtImportDirective directive : file.getImportDirectives()) {
      var path = directive.getImportPath();
      if (path == null || path.isAllUnder()) {
        continue;
      }
      String full = path.getFqName().asString();
      String name = path.getAlias() == null ? full.substring(full.lastIndexOf('.') + 1) : path.getAlias().asString();
      if (KNOWN.containsKey(full)) {
        hosts.put(name, KNOWN.get(full));
      } else {
        hosts.remove(name);
      }
    }
  }

  public void call(KtCallExpression call, Frame frame) {
    String host = nameOf(call.getCalleeExpression());
    if (host != null && ownCall(call) && (synchronizedFunction(call) || insideLock(frame))) {
      lockedCalls.add(m("name", host, "scopes", frame == null ? List.of() : frame.chain()));
    }
    host = hosts.get(host);
    if (host == null || call.getLambdaArguments().isEmpty()) {
      return;
    }
    PsiElement start = call;
    String lock = null;
    if ("synchronized".equals(host)) {
      List<? extends ValueArgument> values = call.getValueArguments();
      lock = values.isEmpty() || values.get(0) instanceof KtLambdaArgument
          ? null : clip(values.get(0).getArgumentExpression());
    } else if (call.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) call.getParent()).getSelectorExpression() == call) {
      start = call.getParent();
      lock = clip(((KtQualifiedExpression) start).getReceiverExpression());
    }
    if (lock == null) {
      return;
    }
    acquisitions.add(m("line", lineOf.applyAsInt(start.getTextRange().getStartOffset()), "host", host,
        "lock", lock, "synchronizedFunction", synchronizedFunction(call), "locals", locals(call),
        "scopes", frame == null ? List.of() : frame.chain()));
  }

  public void assignment(KtBinaryExpression assignment, Frame frame) {
    if (!ASSIGNMENTS.contains(assignment.getOperationToken()) || assignment.getRight() == null) {
      return;
    }
    String operator = assignment.getOperationReference().getText();
    write(assignment, assignment.getLeft(), operator, frame);
  }

  public void step(KtUnaryExpression unary, Frame frame) {
    if (STEPS.contains(unary.getOperationToken())) {
      write(unary, unary.getBaseExpression(), unary.getOperationReference().getText(), frame);
    }
  }

  public Map<String, Object> result() {
    return m("lockAcquisitions", acquisitions, "fieldWrites", writes, "lockedCalls", lockedCalls,
        "lockHosts", new LinkedHashMap<String, Object>(hosts));
  }

  private static boolean ownCall(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return !(parent instanceof KtQualifiedExpression)
        || ((KtQualifiedExpression) parent).getSelectorExpression() != call
        || ((KtQualifiedExpression) parent).getReceiverExpression() instanceof KtThisExpression;
  }

  private boolean insideLock(Frame frame) {
    for (Frame scope = frame; scope != null; scope = scope.parent) {
      if ("lambda".equals(scope.kind()) && hosts.containsKey(scope.data.get("host"))) {
        return true;
      }
    }
    return false;
  }

  private void write(KtExpression write, KtExpression target, String operator, Frame frame) {
    boolean viaThis = false;
    String name = nameOf(target);
    if (target instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) target).getReceiverExpression() instanceof KtThisExpression
        && ((KtThisExpression) ((KtDotQualifiedExpression) target).getReceiverExpression()).getLabelName() == null) {
      name = nameOf(((KtDotQualifiedExpression) target).getSelectorExpression());
      viaThis = true;
    }
    if (name == null) {
      return;
    }
    writes.add(m("line", lineOf.applyAsInt(write.getTextRange().getStartOffset()), "target", name,
        "viaThis", viaThis, "operator", operator, "readsTarget", readsTarget(write, target, name),
        "synchronizedFunction", synchronizedFunction(write), "locals", locals(write),
        "scopes", frame == null ? List.of() : frame.chain()));
  }

  private static boolean readsTarget(KtExpression write, KtExpression target, String name) {
    if (!(write instanceof KtBinaryExpression) || ((KtBinaryExpression) write).getRight() == null) {
      return true;
    }
    for (KtNameReferenceExpression reference : PsiTreeUtil.findChildrenOfType(
        ((KtBinaryExpression) write).getRight(), KtNameReferenceExpression.class)) {
      if (name.equals(reference.getReferencedName())) {
        return true;
      }
    }
    return false;
  }

  private static boolean synchronizedFunction(PsiElement element) {
    KtDeclarationWithBody owner = PsiTreeUtil.getParentOfType(
        element, KtNamedFunction.class, KtPropertyAccessor.class);
    return owner != null && annotationNames(owner).contains("Synchronized");
  }

  private static List<Object> locals(PsiElement element) {
    return Updates.locals(PsiTreeUtil.getParentOfType(
        element, KtNamedFunction.class, KtPropertyAccessor.class, KtClassInitializer.class,
        KtSecondaryConstructor.class));
  }
}
