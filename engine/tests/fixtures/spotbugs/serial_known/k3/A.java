package k3;
import java.util.*;
import java.util.function.*;
import java.io.*;
class A implements Serializable { private I a; } interface I {} interface J extends I {} class K implements J, Serializable {}
