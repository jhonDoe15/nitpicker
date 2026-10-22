package nitpicker.designfacts;

import java.util.*;

final class Body {
  static final class CallFact {
    final MethodInfo target;
    final int line;
    final String receiver;
    final boolean cleanup;
    final long position;
    String mutation;

    CallFact(MethodInfo target, int line, String receiver, boolean cleanup, long position) {
      this.target = target;
      this.line = line;
      this.receiver = receiver;
      this.cleanup = cleanup;
      this.position = position;
    }
  }

  record Forward(MethodInfo target, int position) {}

  static final class Use {
    final int index;
    final Set<String> fields = new LinkedHashSet<>();
    final List<Forward> forwards = new ArrayList<>();
    boolean opaque;

    Use(int index) {
      this.index = index;
    }
  }

  static final class Read {
    final TypeInfo type;
    final int line;
    final Set<String> fields = new LinkedHashSet<>();
    final Set<String> decided = new LinkedHashSet<>();

    Read(TypeInfo type, int line) {
      this.type = type;
      this.line = line;
    }
  }

  final List<CallFact> calls = new ArrayList<>();
  final Map<Integer, Use> uses = new TreeMap<>();
  final Set<String> ownFields = new LinkedHashSet<>();
  final List<Map<String, Object>> decisions = new ArrayList<>();
  final Map<String, Read> reads = new LinkedHashMap<>();
  String returnsField;
}
