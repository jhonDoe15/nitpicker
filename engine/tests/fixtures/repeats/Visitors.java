package repeats;

import java.util.List;
import java.util.Set;

public class Visitors {
  record Call(String owner, String name, int arguments) {}

  record Signature(String text) {
    boolean takesObject() {
      return text.contains("Object");
    }
  }

  private final Set<String> project = Set.of("a.B");

  Signature resolveOverload(Call call) {
    return new Signature(call.name());
  }

  void pass(List<Call> calls) {
    for (Call call : calls) {
      Signature signature = resolveOverload(call);
      if (!project.contains(call.owner())) {
        continue;
      }
      System.out.println(signature.takesObject());
    }
    calls.forEach(call -> {
      Signature signature = resolveOverload(call);
      if (call.arguments() == 0) {
        return;
      }
      System.out.println(signature);
    });
    for (Call call : calls) {
      Signature signature = resolveOverload(call);
      if (project.remove(call.owner())) {
        continue;
      }
      System.out.println(signature);
    }
    for (Call call : calls) {
      Signature signature = resolveOverload(call);
      if (!project.contains(call.owner())) {
        System.out.println(signature);
        continue;
      }
      System.out.println(call);
    }
  }

  void visitCall(Call call) {
    Signature signature = resolveOverload(call);
    if (call.name().isEmpty()) {
      return;
    }
    System.out.println(signature);
  }

  Signature once(Call call) {
    Signature signature = resolveOverload(call);
    if (call.name().isEmpty()) {
      return null;
    }
    return signature;
  }
}
