import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { unclosedInlineResources } from './inline-closeables.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return unclosedInlineResources(scanned).map((reported) => [
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

const RESOURCE = 'import org.springframework.core.io.Resource\n\n';

describe('unclosedInlineResources', () => {
  it.each([
    [
      'a Spring resource stream read at once',
      `${RESOURCE}fun bytes(content: Resource): ByteArray = content.inputStream.readBytes()\n`,
      [[3, 'content.inputStream']],
    ],
    [
      'a resource stream passed to a helper',
      `${RESOURCE}fun text(resource: Resource) = StreamUtils.copyToString(resource.inputStream, UTF_8)\n`,
      [[3, 'resource.inputStream']],
    ],
    [
      'the getter form on a resource from a loader',
      'fun load(loader: ResourceLoader, props: Properties) {\n    props.load(loader.getResource("app.properties").getInputStream())\n}\n',
      [[2, 'loader.getResource("app.properties").getInputStream()']],
    ],
    [
      'a JAR file used as a receiver',
      'fun manifest(root: File) = JarFile(root).manifest\n',
      [[1, 'JarFile(root)']],
    ],
    [
      'a JAR file passed on',
      'fun main(root: File) = MainClassFinder.find(JarFile(root), "demo")\n',
      [[1, 'JarFile(root)']],
    ],
    [
      'a class loader',
      'fun type(urls: Array<URL>, name: String) = URLClassLoader(urls).loadClass(name)\n',
      [[1, 'URLClassLoader(urls)']],
    ],
    [
      'an argument after an elvis',
      'fun load(cached: Config?, file: File) = cached ?: parse(FileInputStream(file))\n',
      [[1, 'FileInputStream(file)']],
    ],
    [
      'a wrapped file reader, reported once',
      'fun first(file: File) = BufferedReader(FileReader(file)).readLine()\n',
      [[1, 'FileReader(file)']],
    ],
    [
      'a file stream turned into a reader',
      'fun first(path: Path) = path.inputStream().bufferedReader().readLine()\n',
      [[1, 'path.inputStream()']],
    ],
    [
      'a reader from a file built in place',
      'fun first(name: String) = File(name).bufferedReader().readText()\n',
      [[1, 'File(name).bufferedReader()']],
    ],
    [
      'a JDBC connection from a data source',
      'fun rows(dataSource: DataSource, sql: String) =\n    dataSource.connection.prepareStatement(sql).executeUpdate()\n',
      [[2, 'dataSource.connection']],
    ],
    [
      'a directory stream as a loop source',
      'fun names(dir: Path) {\n    for (entry in Files.newDirectoryStream(dir)) println(entry)\n}\n',
      [[2, 'Files.newDirectoryStream(dir)']],
    ],
    [
      'a bundled resource',
      'fun bundled(name: String) = javaClass.getResourceAsStream(name)!!.readBytes()\n',
      [[1, 'javaClass.getResourceAsStream(name)']],
    ],
    [
      'a URL stream',
      'fun page(url: URL) = url.openStream().reader().readText()\n',
      [[1, 'url.openStream()']],
    ],
  ])('flags %s', (_name, source, expected) => {
    expect(found(source)).toEqual(expected);
  });

  it.each([
    [
      'a stream closed with use',
      `${RESOURCE}fun bytes(r: Resource) = r.inputStream.use { it.readBytes() }\n`,
    ],
    [
      'a wrapper closed with use',
      'fun first(file: File) = BufferedReader(FileReader(file)).use { it.readLine() }\n',
    ],
    [
      'a member wrapper closed with use',
      'fun first(path: Path) = path.inputStream().bufferedReader().use { it.readLine() }\n',
    ],
    ['readLines, which closes', 'fun lines(file: File) = file.bufferedReader().readLines()\n'],
    ['useLines', 'fun count(file: File) = file.bufferedReader().useLines { it.count() }\n'],
    [
      'a returned stream',
      `${RESOURCE}fun open(r: Resource): InputStream {\n    return r.inputStream\n}\n`,
    ],
    ['an expression body', 'fun open(file: File) = FileInputStream(file)\n'],
    [
      'a variable',
      'fun open(file: File) {\n    val input = FileInputStream(file)\n    input.close()\n}\n',
    ],
    [
      'a property',
      'class Source(file: File) : Closeable {\n    private val reader = FileReader(file)\n}\n',
    ],
    ['bytes in memory', 'fun bytes(data: ByteArray) = data.inputStream().readBytes()\n'],
    ['a string reader', 'fun first(text: String) = text.reader().read()\n'],
    ['a process stream', 'fun output(process: Process) = process.inputStream.readBytes()\n'],
    [
      'a socket stream',
      'fun send(socket: Socket, data: ByteArray) = socket.getOutputStream().write(data)\n',
    ],
    [
      'a wrapper of standard input',
      'fun line() = BufferedReader(InputStreamReader(System.`in`)).readLine()\n',
    ],
    ['a file read that closes', 'fun text(file: File) = file.readText()\n'],
    ['a closing helper', 'fun quiet(file: File) = IOUtils.closeQuietly(FileInputStream(file))\n'],
    [
      'Jackson, which closes the source',
      `${RESOURCE}fun read(r: Resource) = mapper.readValue(r.inputStream, Order::class.java)\n`,
    ],
    ['an unconnected socket', 'fun socket() = Socket().apply { soTimeout = 5 }\n'],
    ['a subclass', 'class Counting(file: File) : FileInputStream(file)\n'],
    ['a supertype call', 'class Counted(file: File) : FilterInputStream(FileInputStream(file))\n'],
    [
      'a delegating constructor',
      'class Lines(input: InputStream) {\n    constructor(file: File) : this(FileInputStream(file))\n}\n',
    ],
    [
      'a project wrapper closed with use',
      'fun first(file: File) = Lines(FileInputStream(file)).use { it.next() }\n',
    ],
    [
      'a stream kept in a list',
      'fun keep(file: File) {\n    streams.add(FileInputStream(file))\n}\n',
    ],
    [
      'a name declared with another type elsewhere',
      'fun a(file: File) = file.length()\n\nfun b(file: Upload) = file.reader().read()\n',
    ],
    ['an import', 'import java.io.FileInputStream\n'],
    ['a comment', '// FileInputStream(file).read()\n'],
  ])('passes %s', (_name, source) => {
    expect(found(source)).toEqual([]);
  });
});
