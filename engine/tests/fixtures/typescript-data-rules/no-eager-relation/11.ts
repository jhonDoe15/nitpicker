import { DataTypes, Model } from 'sequelize';
Order.init({}, { sequelize, defaultScope: { where: { active: true } } });