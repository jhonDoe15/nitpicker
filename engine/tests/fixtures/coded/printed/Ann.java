package printed;
import java.util.*;
import java.lang.annotation.*;
@Target(ElementType.TYPE_USE) @interface A {}
@Target(ElementType.TYPE_USE) @interface B {}
@Target({ElementType.TYPE_USE, ElementType.PARAMETER}) @interface C {}
class Ann<T> implements java.io.Serializable {
    class In<Q> {}
    class Pl {}
    static class St<Q> {}
    @A In f1;
    In<@A String> f2;
    Ann<@A T>.@B Pl f3;
    @A Pl f4;
    Ann.@A Pl f5;
    printed.Ann.@A St<String> f6;
    @A St<@B ? extends Number> f7;
    Ann() { a(null); b(); c(null); d(null); e(null); f(null); g(null); h(null); i(null); j(null); k(null); l(null); }
    public void a(String @A [] @B [] x) {}
    public void b(@A String @B ... x) {}
    public void c(@A int @B [] x) {}
    public void d(List<@A ? super @B String> x) {}
    public void e(java.util.@A List<@B String> x) {}
    public void f(@C @A String x) {}
    public void g(@C List<String> x) {}
    public void h(Ann<@A T>.@B Pl x) {}
    public void i(@A Ann<T>.Pl x) {}
    public void j(Map.@A Entry<String, @B ? extends @A List<@B String>> x) {}
    public void k(@A Ann.Pl x) {}
    public void l(final @A @B In<String> [] x) {}
}
