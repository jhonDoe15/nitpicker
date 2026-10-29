package nitpicker.designfacts.scan;

import java.util.*;
import nitpicker.designfacts.model.*;

public final class Body {
  public static final class CallFact {
    public final MethodInfo target;
    public final int line;
    public final String receiver;
    public final boolean cleanup;
    public final long position;
    public String mutation;

    public CallFact(Call call) {
      this.target = call.target();
      this.line = call.line();
      this.receiver = call.receiver();
      this.cleanup = call.cleanup();
      this.position = call.position();
    }
  }

  public record Call(
      MethodInfo target, int line, String receiver, boolean cleanup, long position) {}

  public record Forward(MethodInfo target, int position) {}

  public static final class Use {
    public final int index;
    public final Set<String> fields = new LinkedHashSet<>();
    public final List<Forward> forwards = new ArrayList<>();
    public boolean opaque;

    public Use(int index) {
      this.index = index;
    }
  }

  public static final class Read {
    public final TypeInfo type;
    public final int line;
    public final Set<String> fields = new LinkedHashSet<>();
    public final Set<String> decided = new LinkedHashSet<>();

    public Read(TypeInfo type, int line) {
      this.type = type;
      this.line = line;
    }
  }

  public final List<CallFact> calls = new ArrayList<>();
  public final Map<Integer, Use> uses = new TreeMap<>();
  public final Set<String> ownFields = new LinkedHashSet<>();
  public final List<Map<String, Object>> decisions = new ArrayList<>();
  public final Map<String, Read> reads = new LinkedHashMap<>();
  public final Set<MethodInfo> references = new LinkedHashSet<>();
  public String returnsField;
}
