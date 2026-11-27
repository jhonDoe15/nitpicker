package h;
import com.fasterxml.jackson.databind.ObjectMapper;
class Unresolved {
    static void v(Object... o) {}
    void g() { v(new Missing[]{}); v((Missing[]) null); }
    Object h() { return new Missing(); }
}
class UnresolvedSingleton {
    private static UnresolvedSingleton inst;
    static UnresolvedSingleton get() { if (inst == null) { Missing.inst = 1; } return inst; }
}
class UnresolvedArrays {
    private Missing[] mf;
    UnresolvedArrays(Missing[] a) { mf = a; }
    void g(Missing[] a) { mf = a; }
}
class UnresolvedMapper {
    private ObjectMapper objectMapper = new ObjectMapper();
    Object r(String s) throws Exception { return objectMapper.readValue(s, Object.class); }
}
