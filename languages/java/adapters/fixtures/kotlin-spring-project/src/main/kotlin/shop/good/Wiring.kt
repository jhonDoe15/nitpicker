package shop.good

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.config.BeanFactoryPostProcessor
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.context.properties.ConfigurationPropertiesBinding
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component

class MetricsProcessor : BeanPostProcessor

@Configuration(proxyBeanMethods = false)
class StaticPostProcessors {
    @Bean
    fun label(shipments: ShipmentRepository): String = shipments.toString()

    companion object {
        @Bean
        @JvmStatic
        fun metrics(environment: Environment, shipments: ObjectProvider<ShipmentRepository>): BeanPostProcessor =
            MetricsProcessor()

        @Bean
        @JvmStatic
        fun names(environment: Environment): BeanFactoryPostProcessor =
            BeanFactoryPostProcessor { }

        @Bean
        @JvmStatic
        @ConfigurationPropertiesBinding
        fun percent(): Converter<String, Int> = Converter { it.toInt() }
    }
}

@Component
class OrderedDecorators(private val decorators: ObjectProvider<Runnable>) {
    fun ordered(extra: List<Runnable>) {
        decorators.orderedStream().forEach { it.run() }
        decorators.ifAvailable { it.run() }
        extra.forEach { it.run() }
        for (decorator in extra) {
            decorator.run()
        }
    }
}
