import { describe, expect, it } from 'vitest';
import { rulesOf } from '../../../test-support/sources.mjs';
import { RANDOM_RULE } from '../isolation.mjs';

const draws = (text) => rulesOf(text, RANDOM_RULE);

const HEAD = `package demo.orders

import java.util.Random
import java.util.UUID
import java.util.concurrent.ThreadLocalRandom
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

`;

describe('Kotlin tests that draw unseeded random values', () => {
  it('reports unseeded generators and collection shuffles', () => {
    const text = `${HEAD}class DrawTest {
    @Test
    fun draws() {
        val a = Random()
        val b = Math.random()
        val c = ThreadLocalRandom.current()
        val d = java.util.Collections.shuffle(items)
        val e = kotlin.random.Random.Default
        val f = kotlin.random.Random.nextInt(10)
        val g = items.random()
        val h = items.shuffled()
        val i = items.randomOrNull()
        items.shuffle()
        val j = java.util.SplittableRandom()
    }
}
`;

    expect(draws(text)).toEqual([
      'DrawTest.draws@12',
      'DrawTest.draws@13',
      'DrawTest.draws@14',
      'DrawTest.draws@15',
      'DrawTest.draws@16',
      'DrawTest.draws@17',
      'DrawTest.draws@18',
      'DrawTest.draws@19',
      'DrawTest.draws@20',
      'DrawTest.draws@21',
      'DrawTest.draws@22',
    ]);
  });

  it('allows seeded generators and values drawn from a given generator', () => {
    const text = `${HEAD}class SeededTest {
    private val random = kotlin.random.Random(42)

    @Test
    fun seeded() {
        val a = Random(42)
        val b = java.util.Random(7)
        val c = items.random(random)
        val d = items.shuffled(random)
        val e = random.nextInt(10)
        val f = SecureRandom()
        val g = UUID.randomUUID()
        Collections.shuffle(items, a)
        val h = 1
    }
}
`;

    expect(draws(text)).toEqual([]);
  });

  it('keeps Random() from kotlin.random out of the java.util form', () => {
    const text = `package demo

import kotlin.random.Random
import org.junit.jupiter.api.Test

class KotlinTest {
    @Test
    fun seeded() {
        val a = Random(1)
        val b = Random()
    }
}
`;

    expect(draws(text)).toEqual([]);
  });

  it('reports a random UUID only as a direct argument of an equality assertion', () => {
    const text = `${HEAD}class IdTest {
    @Test
    fun compared() {
        assertEquals(UUID.randomUUID(), service.create().id)
        assertThat(service.create().id).isEqualTo(UUID.randomUUID())
        assertEquals("id", UUID.randomUUID().toString())
        service.create().id shouldBe UUID.randomUUID()
        UUID.randomUUID().toString() shouldBe other
    }

    @Test
    fun notEquality() {
        assertThat(UUID.randomUUID()).isNotNull()
        assertThat(service.create().id).isNotEqualTo(UUID.randomUUID())
        assertThat(service.find()).isOwner(UUID.randomUUID())
        assertEquals(1, service.count(UUID.randomUUID()))
        UUID.randomUUID() shouldNotBe other
        assertFalse(cache.containsKey(UUID.randomUUID()))
        assertThat(cache).doesNotContainKey(UUID.randomUUID())
    }

    @Test
    fun generated() {
        val id = UUID.randomUUID()
        val order = Order(id = UUID.randomUUID())
        assertEquals(id, service.create(order).id)
    }
}
`;

    expect(draws(text)).toEqual([
      'IdTest.compared@12',
      'IdTest.compared@13',
      'IdTest.compared@14',
      'IdTest.compared@15',
      'IdTest.compared@16',
    ]);
  });

  it('reports a generator seeded from the clock', () => {
    const text = `${HEAD}class SeedTest {
    @Test
    fun seeded() {
        val a = Random(System.nanoTime())
        val b = java.util.Random(System.currentTimeMillis())
        val c = Random(42)
    }
}
`;

    expect(draws(text)).toEqual(['SeedTest.seeded@12', 'SeedTest.seeded@13']);
  });

  it('skips a file that fakes the generator statically', () => {
    const text = `${HEAD}class FakedTest {
    @Test
    fun faked() {
        mockkObject(kotlin.random.Random.Default)
        mockkStatic(UUID::class)
        assertEquals(UUID.randomUUID(), id)
        val a = items.random()
    }
}
`;
    const uuidOnly = text.replace('mockkObject(kotlin.random.Random.Default)', 'println()');
    const randomOnly = text.replace('mockkStatic(UUID::class)', 'println()');

    expect(draws(text)).toEqual([]);
    expect(draws(uuidOnly)).toEqual(['FakedTest.faked@15']);
    expect(draws(randomOnly)).toEqual(['FakedTest.faked@14']);
  });
});
