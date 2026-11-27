import { DataTypes, Model } from 'sequelize';
Order.init({}, { sequelize, defaultScope: { include: { model: Customer, as: 'customer' } } });