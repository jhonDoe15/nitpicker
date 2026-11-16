const JAVA_LANG = `Appendable AutoCloseable CharSequence Cloneable Comparable Iterable Readable Runnable Boolean Byte
Character Class ClassLoader Compiler Double Enum Float Integer Long Math Module Number Object
Package Process ProcessBuilder Record Runtime Short StackTraceElement StrictMath String StringBuffer
StringBuilder System Thread ThreadGroup ThreadLocal Throwable Void Exception Error RuntimeException
ArithmeticException AssertionError StackWalker`;
const JAVA_UTIL = `AbstractCollection AbstractList AbstractMap AbstractQueue AbstractSequentialList AbstractSet
ArrayDeque ArrayList Arrays Base64 BitSet Calendar Collection Collections Comparator Currency Date
Deque Dictionary EnumMap EnumSet Formatter GregorianCalendar HashMap HashSet Hashtable
IdentityHashMap Iterator LinkedHashMap LinkedHashSet LinkedList List ListIterator Locale Map
NavigableMap NavigableSet Objects Observable Observer Optional OptionalDouble OptionalInt
OptionalLong PriorityQueue Properties Queue Random RandomAccess ResourceBundle Scanner Set SortedMap
SortedSet Spliterator Spliterators SplittableRandom Stack StringJoiner StringTokenizer Timer
TimerTask TimeZone TreeMap TreeSet UUID Vector WeakHashMap`;
const JAVA_IO = `BufferedInputStream BufferedOutputStream BufferedReader BufferedWriter ByteArrayInputStream
ByteArrayOutputStream CharArrayReader CharArrayWriter Closeable Console DataInput DataInputStream
DataOutput DataOutputStream File FileDescriptor FileFilter FileInputStream FileOutputStream
FileReader FileWriter Flushable InputStream InputStreamReader ObjectInput ObjectInputStream
ObjectOutput ObjectOutputStream OutputStream OutputStreamWriter PrintStream PrintWriter
PushbackInputStream PushbackReader RandomAccessFile Reader Serializable StreamTokenizer StringReader
StringWriter Writer IOException`;
const JAVA_NIO_FILE = `Files FileSystem FileSystems Path Paths FileStore FileVisitor DirectoryStream WatchService
StandardOpenOption StandardCopyOption LinkOption`;

const JDK_TYPES = new Set(
  [JAVA_LANG, JAVA_UTIL, JAVA_IO, JAVA_NIO_FILE].flatMap((names) => names.split(/\s+/u)),
);

export function isJdkType(name) {
  return JDK_TYPES.has(name);
}
