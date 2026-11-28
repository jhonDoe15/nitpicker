package q;
interface I { static void f(){} }
public class A implements I { static void f(){} 
 static void a(){} }
class B extends A { 
 // comment
 /** doc */
 @SuppressWarnings("x") @Deprecated
 public
 static
 final
 void
 a
 ()
 {}
 static void f(){} }
class $D { static void f(){} }
class E$F extends $D { static void f(){} }
class G extends E$F { static void f(){} }
