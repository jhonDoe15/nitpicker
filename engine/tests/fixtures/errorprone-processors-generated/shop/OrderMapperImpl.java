package shop;

import javax.annotation.processing.Generated;

@Generated(
    value = "org.mapstruct.ap.MappingProcessor",
    date = "2026-11-27T14:04:48+0000",
    comments = "version: 1.6.3, compiler: javac, environment: Java 21.0.13.1 (Ubuntu)"
)
public class OrderMapperImpl implements OrderMapper {

    @Override
    public OrderDto toDto(Order order) {
        if ( order == null ) {
            return null;
        }

        OrderDto orderDto = new OrderDto();

        orderDto.setId( order.getId() );
        orderDto.setCount( order.getCount() );

        return orderDto;
    }
}
