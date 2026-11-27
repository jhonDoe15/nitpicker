package shop;

import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface OrderMapper {
  OrderMapper INSTANCE = Mappers.getMapper(OrderMapper.class);

  OrderDto toDto(Order order);

  default String name(Order order) {
    return order.getId().toLowerCase();
  }
}
