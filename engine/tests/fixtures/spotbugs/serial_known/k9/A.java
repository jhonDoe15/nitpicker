package k9;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private I a; } interface I {} class D implements I {} class E extends D implements Serializable {} class F implements I, Serializable {}
