import graphene

from shop.models import Customer, Order


class CustomerType(graphene.ObjectType):
    name = graphene.String()


class OrderType(graphene.ObjectType):
    customer = graphene.Field(CustomerType)

    def resolve_customer(parent, info):
        return info.context.customer_loader.load(parent.customer_id)


class Query(graphene.ObjectType):
    orders = graphene.List(OrderType)
    me = graphene.Field(CustomerType)

    def resolve_orders(root, info):
        return Order.objects.all()

    def resolve_me(root, info):
        return Customer.objects.get(pk=1)
