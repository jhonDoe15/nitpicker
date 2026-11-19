from sqlalchemy import create_engine

from shop.orders import count_orders

engine = create_engine("sqlite://")
count_orders()
