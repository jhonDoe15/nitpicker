import { Model } from '@sequelize/core';
Order.init({}, { sequelize, defaultScope: { include: [Customer] } });