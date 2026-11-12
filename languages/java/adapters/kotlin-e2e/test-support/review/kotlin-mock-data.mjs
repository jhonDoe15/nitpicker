const SPRING = 'src/test/kotlin/org/springframework';

const CONFIGURATION_PROPERTIES = `package org.springframework.boot.context.properties

annotation class ConfigurationProperties(val prefix: String)
`;

const SPRING_BOOT_TEST = `package org.springframework.boot.test.context

annotation class SpringBootTest(val webEnvironment: String = "MOCK")
`;

const AUTOWIRED = `package org.springframework.beans.factory.annotation

annotation class Autowired
`;

const MOCKK_STUB = `package io.mockk

inline fun <reified T : Any> mockk(): T = throw UnsupportedOperationException(T::class.java.name)

fun <T : Any> spyk(target: T): T = target

fun every(stub: () -> Any?) = stub

fun mockkObject(vararg objects: Any) = objects.size
`;

const MAILER_TEST = `package demo.orders

import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.spyk
import kotlin.test.Test
import kotlin.test.assertEquals

class MailerTest {
    private val mocked by lazy { mockk<Mailer>() }
    private val watched = spyk(Mailer("h"))
    private val verified = spyk(Mailer("v"))

    fun stubs() {
        every { watched.send() }
        mockkObject(Inventory)
        mockkObject(mocked)
    }

    @Test
    fun sends() {
        assertEquals("v3", verified.send())
    }
}
`;

export const LIBRARY_STUBS = {
  'src/main/kotlin/org/springframework/boot/context/properties/ConfigurationProperties.kt':
    CONFIGURATION_PROPERTIES,
  [`${SPRING}/boot/test/context/SpringBootTest.kt`]: SPRING_BOOT_TEST,
  [`${SPRING}/beans/factory/annotation/Autowired.kt`]: AUTOWIRED,
  'src/test/kotlin/io/mockk/MockK.kt': MOCKK_STUB,
};

export const MOCK_RULE_FILES = {
  'src/test/kotlin/demo/orders/MailerTest.kt': MAILER_TEST,
};

export const MOCK_REVIEW_FINDINGS = [
  'MockedSubjectInTest MailerTest',
  'MockedSubjectInTest MailerTest',
  'StaticMockOfProjectType MailerTest',
];
