import { DataTypes, Model } from 'sequelize';
Order.init({}, { sequelize, scopes: { withCustomer: { include: [Customer] } } });