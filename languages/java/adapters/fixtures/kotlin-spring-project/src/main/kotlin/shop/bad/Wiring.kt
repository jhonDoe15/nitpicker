package shop.bad

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.config.BeanFactoryPostProcessor
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.context.properties.ConfigurationPropertiesBinding
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer
import org.springframework.core.convert.converter.Converter
import org.springframework.stereotype.Component

class TracingProcessor : BeanPostProcessor

@Configuration(proxyBeanMethods = false)
class PostProcessorConfig {
    @Bean
    fun tracing(): BeanPostProcessor = TracingProcessor()

    @Bean
    fun placeholders() = PropertySourcesPlaceholderConfigurer()

    @Bean
    fun traced(): TracingProcessor = TracingProcessor()

    @Bean
    @ConfigurationPropertiesBinding
    fun cents(): Converter<String, Long> = Converter { it.toLong() }

    companion object {
        @Bean
        fun unmarked(): BeanFactoryPostProcessor = BeanFactoryPostProcessor { }

        @Bean
        @JvmStatic
        fun auditing(ledgers: LedgerRepository): BeanPostProcessor = TracingProcessor()
    }
}

@Component
class Decorators(private val decorators: ObjectProvider<Runnable>) {
    fun unordered() {
        decorators.forEach { it.run() }
        decorators.stream().forEach { it.run() }
        for (decorator in decorators) {
            decorator.run()
        }
        decorators.iterator().next().run()
        decorators.map { it.toString() }
    }
}
