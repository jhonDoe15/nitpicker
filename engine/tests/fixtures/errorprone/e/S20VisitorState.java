import com.google.errorprone.VisitorState;
import com.google.errorprone.suppliers.Supplier;
import javacstub.Name;
import javacstub.Symbol;
import javacstub.Type;

class S20VisitorStateSingle {
  public S20VisitorStateSingle(VisitorState state) {
    Name me = state.getName("Test");
  }
}

class S20VisitorStateExisting {
  private static final String MAP = "java.util.Map";

  public S20VisitorStateExisting(VisitorState state) {
    Type map = state.getTypeFromString(MAP);
    Type map2 = state.getTypeFromString("java.util.Map");
  }
}

class S20VisitorStateConflict {
  public S20VisitorStateConflict(VisitorState state) {
    Name className = state.getName("java.lang.Class");
    Type classType = state.getTypeFromString("java.lang.Class");
    Name lookupAgain = state.getName("java.lang.Class");
    Symbol symbol = state.getSymbolFromString("a-b");
  }
}

class S20VisitorStateMemoized {
  private static final Supplier<Name> ALLOWED =
      VisitorState.memoize(state -> state.getName("foo"));
}

class S20VisitorStateSuppressed {
  @SuppressWarnings("MemoizeConstantVisitorStateLookups")
  public S20VisitorStateSuppressed(VisitorState state) {
    Name className = state.getName("java.lang.Class");
  }

  @SuppressWarnings("MemoizeConstantVisitorStateLookups")
  class Inner {
    void innerMethod(VisitorState state) {
      Name className = state.getName("java.lang.Class");
    }
  }
}

class S20VisitorStateNotConstant {
  void run(VisitorState state, String value) {
    Name name = state.getName(value);
  }
}
