package printed.dims;
import java.util.*;
import java.lang.annotation.*;
@Target(ElementType.TYPE_USE) @interface TU {}
@Target(ElementType.TYPE_USE) @interface TV {}
@Target({ElementType.TYPE_USE, ElementType.FIELD}) @interface TF {}
@interface NT {}
class Dims<T> implements java.io.Serializable {
    class In {}
    @TU String @TV [] a1;
    @TU String a2 @TV [];
    String @TV [] a3 @TU [];
    @TF In a4;
    @TF In a5 @TU [];
    @TF String[] a6;
    @NT String[] a7;
    java.lang.@TU String a8;
    java.util.@TU List<String> a9;
    @TU java.util.List<String> a10;
    List<@TU ? extends @TV T> a11;
    List<@TU T> a12;
    @TU T a13;
    @TU List<@TV String>[] a14;
    Map.@TU Entry<String,String> a15;
    @TU Map.Entry<String,String> a16;
    Dims<T>.@TU In a17;
    @TU Dims<T>.In a18;
    @TU @TV @TU String a19;
    @TV @TU String a20;
    Dims() { a(null); b(); c(); d(); e(); f(null); g(null); h(null);}
    void a(@TU String @TV [] x @TU []) {}
    void b(String @TU ... x) {}
    void c(@TU String ... x) {}
    void d(@TU String @TV [] @TU ... x) {}
    void e(@TU T... x) {}
    void f(@TF String x) {}
    void g(@TV int @TU [] @TV [] x) {}
    void h(Map.@TU Entry<@TV String, ? super @TU T[]> x) {}
}
