package nitpicker.designfacts.facts;

import com.sun.source.tree.*;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;
import nitpicker.designfacts.scan.*;
import nitpicker.designfacts.scope.*;

public final class CallableFacts {
  private final Typer typer;
  private final Surface surface;

  public CallableFacts(Typer typer, Surface surface) {
    this.typer = typer;
    this.surface = surface;
  }

  public Map<String, Object> build(MethodInfo method) {
    Ctx ctx = Ctx.forMethod(method);
    Body body = new Body();
    List<Map<String, Object>> params = parameters(method, ctx, body);
    if (method.tree != null && method.tree.getBody() != null) {
      new BodyScanner(body, typer, ctx).run();
    }
    Map<String, Object> map = header(method);
    map.put("params", params);
    map.put("returns", returns(method, ctx));
    map.put("forward", forward(method, ctx));
    putBody(map, method, body);
    return map;
  }

  private static void putBody(Map<String, Object> map, MethodInfo method, Body body) {
    map.put("calls", calls(body));
    map.put("paramUses", uses(body));
    map.put("ownFields", body.ownFields.isEmpty() ? null : List.copyOf(body.ownFields));
    map.put("returnsField", method.tree == null ? method.lombokField : body.returnsField);
    map.put("decisions", body.decisions);
    map.put("reads", reads(body));
    map.put("references", references(body));
  }

  private Map<String, Object> header(MethodInfo method) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("id", method.id);
    map.put("file", method.owner.unit.file);
    map.put("name", method.displayName());
    map.put("line", method.line);
    map.put("kind", kind(method));
    map.put("owner", method.owner.id);
    map.put("exported", surface.exported(method));
    map.put("entry", surface.entry(method) ? Boolean.TRUE : null);
    return map;
  }

  private static List<String> references(Body body) {
    Set<String> ids = new TreeSet<>();
    for (MethodInfo target : body.references) {
      ids.add(target.id);
    }
    return ids.isEmpty() ? null : List.copyOf(ids);
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
      params.add(parameter(param, ty));
      String kind = ty.type() == null ? null : ty.type().designKind;
      if ("class".equals(kind) || "data".equals(kind) || "interface".equals(kind)) {
        Body.Use use = new Body.Use(index);
        use.opaque = method.tree != null && method.tree.getBody() == null;
        body.uses.put(index, use);
      }
    }
    return params;
  }

  private static Map<String, Object> parameter(ParamInfo param, Ty ty) {
    Map<String, Object> entry = new LinkedHashMap<>();
    entry.put("name", param.name);
    entry.put("type", ty.render());
    entry.put("variadic", param.varargs ? Boolean.TRUE : null);
    return entry;
  }

  private String returns(MethodInfo method, Ctx ctx) {
    boolean none = method.ctor || method.returnType == null;
    return none ? null : typer.tyOf(method.returnType, ctx).render();
  }

  private Map<String, Object> forward(MethodInfo method, Ctx ctx) {
    MethodInvocationTree call = forwardedCall(method);
    MethodInfo target = call == null ? null : typer.calls.resolve(call, ctx).target();
    if (target == null) {
      return null;
    }
    List<Integer> arguments =
        call.getArguments().stream()
            .map(argument -> parameterIndex(method, Names.unparen(argument)))
            .toList();
    boolean unrelated = arguments.stream().allMatch(index -> index < 0);
    if (arguments.isEmpty() ? chained(call) : unrelated) {
      return null;
    }
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("target", target.id);
    map.put("arguments", arguments);
    map.put("returned", !isVoid(method));
    return map;
  }

  private static boolean isVoid(MethodInfo method) {
    return "void".equals(Names.typeText(method.returnType));
  }

  private static MethodInvocationTree forwardedCall(MethodInfo method) {
    BlockTree block = method.ctor || method.tree == null ? null : method.tree.getBody();
    if (block == null || block.getStatements().size() != 1) {
      return null;
    }
    Tree expression =
        switch (block.getStatements().get(0)) {
          case ReturnTree returned when !isVoid(method) -> returned.getExpression();
          case ExpressionStatementTree plain when isVoid(method) -> plain.getExpression();
          default -> null;
        };
    return Names.unparen(expression) instanceof MethodInvocationTree call ? call : null;
  }

  private static boolean chained(MethodInvocationTree call) {
    return call.getMethodSelect() instanceof MemberSelectTree select
        && Names.unwrap(select.getExpression()) instanceof MethodInvocationTree;
  }

  private static int parameterIndex(MethodInfo method, Tree argument) {
    if (!(argument instanceof IdentifierTree identifier)) {
      return -1;
    }
    for (int index = 0; index < method.params.size(); index++) {
      if (method.params.get(index).name.contentEquals(identifier.getName())) {
        return index;
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
      Map<String, Object> map = new LinkedHashMap<>();
      map.put("param", use.index);
      map.put("fields", List.copyOf(use.fields));
      map.put("forwards", forwards(use));
      map.put("opaque", use.opaque ? Boolean.TRUE : null);
      uses.add(map);
    }
    return uses;
  }

  private static List<Map<String, Object>> forwards(Body.Use use) {
    List<Map<String, Object>> forwards = new ArrayList<>();
    for (Body.Forward forward : use.forwards) {
      Map<String, Object> entry = new LinkedHashMap<>();
      entry.put("target", forward.target().id);
      entry.put("position", forward.position());
      forwards.add(entry);
    }
    return forwards;
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
