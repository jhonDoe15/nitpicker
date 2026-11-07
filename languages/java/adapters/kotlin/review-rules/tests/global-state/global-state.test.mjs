import { describe, expect, it } from 'vitest';
import { rulesOf } from '../../test-support/sources.mjs';
import { GLOBAL_STATE_RULE } from './global-state.mjs';

const leaks = (text) => rulesOf(text, GLOBAL_STATE_RULE);

const HEAD = `package demo.orders

import java.util.Locale
import java.util.TimeZone
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import demo.time.Clock
import io.restassured.RestAssured

`;

describe('Kotlin tests that change process-wide state', () => {
  it('reports JDK globals and project statics that nothing restores', () => {
    const text = `${HEAD}class LeakTest {
    @Test
    fun leaks() {
        System.setProperty("shop.currency", "EUR")
        Locale.setDefault(Locale.US)
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
        System.setOut(System.err)
        Thread.setDefaultUncaughtExceptionHandler { _, _ -> }
        java.security.Security.addProvider(null)
        Clock.offset = 5
        Clock.setZone("UTC")
        Prices.Companion.rounding += 2
        RestAssured.baseURI = "http://localhost"
        Holder.value = 1
        System.getProperty("shop.currency")
        Fixtures.setUp()
        Fixtures.setUpDatabase()
        java.io.File("x").inputStream().use {
            System.setProperty("shop.channel", "web")
        }
    }

    object Holder {
        var value = 0
    }
}
`;

    expect(leaks(text)).toEqual([
      'LeakTest.leaks@13',
      'LeakTest.leaks@14',
      'LeakTest.leaks@15',
      'LeakTest.leaks@16',
      'LeakTest.leaks@17',
      'LeakTest.leaks@18',
      'LeakTest.leaks@19',
      'LeakTest.leaks@20',
      'LeakTest.leaks@21',
      'LeakTest.leaks@28',
    ]);
  });

  it('spares a restore in finally, an after function, a helper it calls and the extensions', () => {
    const text = `${HEAD}import org.junitpioneer.jupiter.RestoreSystemProperties
import org.junitpioneer.jupiter.DefaultTimeZone
import uk.org.webcompere.systemstubs.jupiter.SystemStub
import uk.org.webcompere.systemstubs.stream.SystemOut
import kotlinx.coroutines.Dispatchers

class RestoredTest {
    @SystemStub
    private val out = SystemOut()

    @Test
    fun restoresInFinally() {
        val previous = System.getProperty("shop.region")
        System.setProperty("shop.region", "EU")
        try {
            Clock.offset = 3
        } finally {
            System.setProperty("shop.region", previous)
            Clock.reset()
        }
    }

    @Test
    @RestoreSystemProperties
    fun restoredByPioneer() {
        System.setProperty("shop.channel", "web")
    }

    @Test
    @DefaultTimeZone("UTC")
    fun zoneRestoredByPioneer() {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Paris"))
        System.setOut(System.err)
    }

    @Test
    fun scoped() {
        Clock.frozen().use {
            Clock.offset = 1
        }
        Dispatchers.setMain(Dispatchers.Unconfined)
        Locale.setDefault(Locale.GERMANY)
        Clock.setZone("UTC")
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
        resetLocale()
    }

    private fun resetLocale() {
        Locale.setDefault(Locale.ROOT)
        Clock.zone = "Z"
    }
}
`;

    expect(leaks(text)).toEqual([]);
  });

  it('reads Kotest after blocks and spares helpers outside test classes that restore', () => {
    const text = `package demo.orders

import io.kotest.core.spec.style.FunSpec
import io.kotest.extensions.system.withSystemProperty

class ClockSpec : FunSpec({
    afterTest { Clock.offset = 0 }

    test("shifts the clock") {
        Clock.offset = 10
        Clock.setZone("UTC")
        withSystemProperty("shop.region", "EU") {
            System.setProperty("shop.region", "US")
        }
    }
})

object TimeHelper {
    fun freeze() {
        Clock.offset = 10
    }

    fun thaw() {
        Clock.offset = 0
    }
}
`;

    expect(leaks(text)).toEqual(['ClockSpec@11']);
  });

  it('looks for the restore in a Kotest spec only in its after blocks, and reads listeners in the constructor', () => {
    const text = `package demo.orders

import io.kotest.core.spec.style.FunSpec
import io.kotest.core.spec.style.StringSpec
import io.kotest.extensions.system.SystemPropertyTestListener

class PropertySpec : StringSpec({
    "sets" { System.setProperty("a", "b") }
    "clears" {
        System.setProperty("a", "b")
        System.clearProperty("a")
    }
})

class ListenedSpec : FunSpec({
    extensions(SystemPropertyTestListener("a", "b"))
    test("x") { System.setProperty("a", "c") }
})

class OuterTest {
    @org.junit.jupiter.api.Test
    fun changes() { System.setProperty("a", "b") }

    inner class Inner {
        @org.junit.jupiter.api.AfterEach
        fun restore() { System.clearProperty("a") }
    }
}
`;

    expect(leaks(text)).toEqual([
      'PropertySpec@8',
      'PropertySpec@10',
      'PropertySpec@11',
      'OuterTest.changes@22',
    ]);
  });

  it('leaves a same-name class from another library and a Locale that is not java.util alone', () => {
    const text = `package com.acme.orders

import org.library.Settings
import com.acme.config.Flags
import com.other.Locale

class SettingsTest {
    @org.junit.jupiter.api.Test
    fun settings() {
        Settings.verbose = true
        Locale.setDefault("x")
        Flags.debug = true
        org.library.Config.level = 2
        com.acme.Config.level = 2
    }
}
`;

    expect(leaks(text)).toEqual(['SettingsTest.settings@12', 'SettingsTest.settings@14']);
  });
});
