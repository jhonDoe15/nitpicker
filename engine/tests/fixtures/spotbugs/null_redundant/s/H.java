package s;
public class H {
    static void use(Object o) {}
    static Object make() throws Exception { return ""; }
    void a(Object x) { if (x == null) { try { make(); } catch (Exception e) { use(x); } } }
    int b(Object x) { if (x == null) { try { make(); } catch (Exception e) { return x.hashCode(); } } return 0; }
    void c(Object x) throws Exception { if (x == null) { try { make(); } finally { use(x); } } }
    void d() { Object x = null; try { make(); } catch (Exception e) { use(x); } }
    void e(Object x) { if (x == null) { try { make(); } catch (Exception e) { if (x == null) use(""); } } }
    void f(Object x) { x.hashCode(); try { make(); } catch (Exception e) { if (x == null) use(""); } }
    void g(Object x) { try { x.hashCode(); make(); } catch (Exception e) { if (x == null) use(""); } }
    void h(Object x) { if (x != null) { try { make(); } catch (Exception e) { if (x == null) use(""); } } }
    void i() { Object x = new Object(); try { make(); } catch (Exception e) { if (x == null) use(""); } }
    void j(Object x) throws Exception { Object y = null; try { y = make(); } finally { if (y != null) use(y); } }
}
