package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;

final class CallableFacts {
  private final Typer typer;
  private final Surface surface;

  CallableFacts(Typer typer, Surface surface) {
    this.typer = typer;
    this.surface = surface;
  }

  Map<String, Object> build(MethodInfo method) {
    Ctx ctx = new Ctx(method.owner, method.typeVars);
    Body body = new Body();
    List<Map<String, Object>> params = parameters(method, ctx, body);
    if (method.tree != null && method.tree.getBody() != null) {
      new BodyScanner(body, typer, ctx, method).run();
    }
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("id", method.id);
    map.put("file", method.owner.unit.file);
    map.put("name", method.displayName());
    map.put("line", method.line);
    map.put("kind", kind(method));
    map.put("owner", method.owner.id);
    map.put("exported", surface.exported(method));
    map.put("entry", surface.entry(method) ? Boolean.TRUE : null);
    map.put("params", params);
    map.put("returns", returns(method, ctx));
    map.put("forward", forward(method, ctx));
    map.put("calls", calls(body));
    map.put("paramUses", uses(body));
    map.put("ownFields", body.ownFields.isEmpty() ? null : List.copyOf(body.ownFields));
    map.put("returnsField", method.tree == null ? method.lombokField : body.returnsField);
    map.put("decisions", body.decisions);
    map.put("reads", reads(body));
    return map;
  }

  private static String kind(MethodInfo method) {
    if (method.ctor) {
      return "constructor";
    }
    return method.accessorField != null ? "accessor" : "method";
  }

  private List<Map<String, Object>> parameters(MethodInfo method, Ctx ctx, Body body) {
    List<Map<String, Object>> params = new ArrayList<>();
    for (int index = 0; index < method.params.size(); index++) {
      ParamInfo param = method.params.get(index);
      Ty ty = typer.tyOf(param.type, ctx);
      ctx.declare(param.name, ty, index);
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("name", param.name);
      entry.put("type", ty.render());
      entry.put("variadic", param.varargs ? Boolean.TRUE : null);
      params.add(entry);
      String kind = ty.type() == null ? null : ty.type().designKind;
      if ("class".equals(kind) || "data".equals(kind) || "interface".equals(kind)) {
        Body.Use use = new Body.Use(index);
        use.opaque = method.tree != null && method.tree.getBody() == null;
        body.uses.put(index, use);
      }
    }
    return params;
  }

  private String returns(MethodInfo method, Ctx ctx) {
    return method.ctor || method.returnType == null ? null : typer.tyOf(method.returnType, ctx).render();
  }

  private Map<String, Object> forward(MethodInfo method, Ctx ctx) {
    if (method.ctor || method.tree == null || method.tree.getBody() == null
        || method.tree.getBody().getStatements().size() != 1) {
      return null;
    }
    StatementTree statement = method.tree.getBody().getStatements().get(0);
    boolean isVoid = "void".equals(Names.typeText(method.returnType));
    Tree expression = null;
    if (statement instanceof ReturnTree returned && !isVoid) {
      expression = returned.getExpression();
    } else if (statement instanceof ExpressionStatementTree plain && isVoid) {
      expression = plain.getExpression();
    }
    if (!(Names.unparen(expression) instanceof MethodInvocationTree call)) {
      return null;
    }
    MethodInfo target = typer.calls.resolve(call, ctx).target();
    if (target == null) {
      return null;
    }
    List<Integer> arguments = new ArrayList<>();
    for (ExpressionTree argument : call.getArguments()) {
      arguments.add(parameterIndex(method, Names.unparen(argument)));
    }
    if (!arguments.isEmpty() && arguments.stream().allMatch(index -> index < 0)) {
      return null;
    }
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("target", target.id);
    map.put("arguments", arguments);
    map.put("returned", !isVoid);
    return map;
  }

  private static int parameterIndex(MethodInfo method, Tree argument) {
    if (argument instanceof IdentifierTree identifier) {
      for (int index = 0; index < method.params.size(); index++) {
        if (method.params.get(index).name.contentEquals(identifier.getName())) {
          return index;
        }
      }
    }
    return -1;
  }

  private static List<Map<String, Object>> calls(Body body) {
    List<Map<String, Object>> calls = new ArrayList<>();
    for (Body.CallFact fact : body.calls) {
      Map<String, Object> map = new LinkedHashMap<>();
      map.put("target", fact.target.id);
      map.put("line", fact.line);
      map.put("receiver", fact.receiver);
      map.put("cleanup", fact.cleanup ? Boolean.TRUE : null);
      map.put("mutation", fact.mutation);
      calls.add(map);
    }
    return calls;
  }

  private static List<Map<String, Object>> uses(Body body) {
    List<Map<String, Object>> uses = new ArrayList<>();
    for (Body.Use use : body.uses.values()) {
      List<Map<String, Object>> forwards = new ArrayList<>();
      for (Body.Forward forward : use.forwards) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("target", forward.target().id);
        entry.put("position", forward.position());
        forwards.add(entry);
      }
      Map<String, Object> map = new LinkedHashMap<>();
      map.put("param", use.index);
      map.put("fields", List.copyOf(use.fields));
      map.put("forwards", forwards);
      map.put("opaque", use.opaque ? Boolean.TRUE : null);
      uses.add(map);
    }
    return uses;
  }

  private static List<Map<String, Object>> reads(Body body) {
    List<Map<String, Object>> reads = new ArrayList<>();
    for (Body.Read read : body.reads.values()) {
      Map<String, Object> map = new LinkedHashMap<>();
      map.put("type", read.type.id);
      map.put("fields", List.copyOf(read.fields));
      map.put("decided", read.decided.isEmpty() ? null : List.copyOf(read.decided));
      map.put("line", read.line);
      reads.add(map);
    }
    return reads;
  }
}
