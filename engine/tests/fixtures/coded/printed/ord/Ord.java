package printed.ord;
import java.util.*;
import java.lang.annotation.*;
@Target(ElementType.TYPE_USE) @interface A {}
@Target(ElementType.TYPE_USE) @interface B {}
@Target({ElementType.TYPE_USE, ElementType.PARAMETER}) @interface C {}
@interface D {}
@Target(ElementType.PARAMETER) @interface E {}
class Base<X> { class Inh<Y> {} }
class Ord<T extends Number> extends Base<String> implements java.io.Serializable {
    class In<Q> {}
    @B @A In f1;
    @A @B @C @D @E In g0;
    Inh f2;
    Ord() { a(null); b(null); c(null); d(null); e(null); f(null); g(); h(null); i(null); j(null); }
    public void a(@B @A String x) {}
    public void b(@C @B String x) {}
    public void c(@D @C @A @E String x) {}
    public void d(@A Map.Entry<String, String> x) {}
    public void e(@A T x) {}
    public void f(List<@A T> x) {}
    public void g(@A List<String> @B ... x) {}
    public void h(Inh x) {}
    public void i(@E @A java.util.List<String> x) {}
    public void j(@A String @B [] @C [] x[]) {}
}
