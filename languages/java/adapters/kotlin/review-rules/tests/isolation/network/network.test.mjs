import { describe, expect, it } from 'vitest';
import { rulesOf } from '../../../test-support/sources.mjs';
import { NETWORK_RULE } from '../isolation.mjs';

const calls = (text) => rulesOf(text, NETWORK_RULE);

const HEAD = `package demo.orders

import java.net.URL
import org.junit.jupiter.api.Test

`;

describe('Kotlin unit tests that call a real remote host', () => {
  it('reports a remote URL that reaches a client', () => {
    const text = `${HEAD}class RemoteTest {
    private val restTemplate = RestTemplate()
    private val client = HttpClient(CIO)
    private val java = HttpClient.newHttpClient()
    private val ok = OkHttpClient()

    @Test
    fun remote() {
        URL("https://api.example.com/orders").readText()
        URI.create("https://api.example.com/x").toURL().openStream()
        HttpRequest.newBuilder(URI.create("https://api.example.com/y")).build()
        restTemplate.getForObject("https://api.example.com/z", String::class.java)
        WebClient.create("http://api.example.com")
        WebClient.builder().baseUrl("wss://stream.example.com").build()
        Request.Builder().header("a", "b").url("https://api.example.com/q").build()
        Jsoup.connect("https://example.org/").get()
        Socket("db.example.com", 5432)
        runBlocking { client.get("https://api.example.com/k") }
        runBlocking { client.get { url("https://api.example.com/m") } }
        "https://api.example.com/f".httpGet()
    }
}
`;

    expect(calls(text)).toEqual(
      Array.from({ length: 12 }, (_, index) => `RemoteTest.remote@${String(14 + index)}`),
    );
  });

  it('follows a URL held in a constant, a local or a template', () => {
    const text = `${HEAD}const val BASE = "https://api.example.com"

class HeldTest {
    companion object {
        private const val ORDERS = "https://api.example.com/orders/\${1 + 1}"
    }

    @Test
    fun held() {
        val local = "https://api.example.com/local"
        URL(BASE).readText()
        URL("$BASE/orders").readText()
        URL(ORDERS).readBytes()
        val url = URL(local)
        url.openConnection()
    }
}
`;

    expect(calls(text)).toEqual([
      'HeldTest.held@16',
      'HeldTest.held@17',
      'HeldTest.held@18',
      'HeldTest.held@20',
    ]);
  });

  it('allows loopback hosts, relative paths, unknown values and unrelated calls', () => {
    const text = `${HEAD}class LocalTest {
    private val restTemplate = RestTemplate()

    @Test
    fun local() {
        URL("http://localhost:8080/orders").readText()
        URL("http://127.0.0.1/x").readText()
        URL("http://[::1]:80/x").readText()
        URL("http://0.0.0.0/x").readText()
        URL("http://host.docker.internal/x").readText()
        URL("http://shop.localhost/x").readText()
        URL(address).readText()
        restTemplate.getForObject("/orders", String::class.java)
        Socket("localhost", 80)
        val link = "https://example.com/docs"
        assertEquals("https://example.com/docs", page.link)
        println(link)
        server.url("/").toString()
    }
}
`;

    expect(calls(text)).toEqual([]);
  });

  it('allows stubbing, verification, mocks and a faked transport', () => {
    const text = `${HEAD}class MockedTest {
    @MockK
    lateinit var gateway: RestTemplate
    private val restTemplate = mockk<RestTemplate>()

    @Test
    fun stubbed() {
        every { restTemplate.getForObject("https://api.example.com/a", String::class.java) } returns "x"
        verify { restTemplate.getForObject("https://api.example.com/a", String::class.java) }
        whenever(gateway.getForObject("https://api.example.com/b", String::class.java)).thenReturn("y")
        gateway.postForObject("https://api.example.com/c", body, String::class.java)
        restTemplate.exchange("https://api.example.com/d", HttpMethod.GET, null, String::class.java)
    }
}
`;

    expect(calls(text)).toEqual([]);
    expect(
      calls(`${HEAD}class FakedTest {
    @Test
    fun faked() {
        val engine = MockEngine { respondOk() }
        URL("https://api.example.com/a").readText()
    }
}
`),
    ).toEqual([]);
    expect(calls(text.replace('@MockK\n    lateinit var gateway', 'lateinit var gateway'))).toEqual(
      ['MockedTest.stubbed@15'],
    );
  });

  it('does not call a request builder or a client that brings its own transport', () => {
    const build = `${HEAD}class BuildTest {
    @Test
    fun build() {
        HttpRequest.newBuilder(URI.create("https://api.example.com/y")).build()
        Request.Builder().url("https://api.example.com/q").build()
        WebClient.create("https://api.example.com")
        Socket("db.example.com", 5432)
        InetSocketAddress("db.example.com", 5432)
        URL("HTTPS://api.example.com/x").readText()
    }
}
`;

    expect(calls(build)).toEqual([
      'BuildTest.build@11',
      'BuildTest.build@12',
      'BuildTest.build@14',
    ]);
    const faked = `${build}\nval factory = WebClient.builder().exchangeFunction(fake).build()\n`;
    expect(calls(faked)).toEqual(['BuildTest.build@12', 'BuildTest.build@14']);
    const java = build.replace(
      'class BuildTest',
      'val a = HttpClient.newHttpClient()\nclass BuildTest',
    );
    expect(calls(java)).toHaveLength(4);
  });
});
