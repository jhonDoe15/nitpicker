package f25;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private final Thread a; private final Runnable b; A() { a = new Thread(); b = a; } }
