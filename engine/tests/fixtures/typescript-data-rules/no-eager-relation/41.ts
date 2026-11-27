import { DataTypes, Model } from 'sequelize';
Order.addScope('defaultScope', { include: [Customer] }, { override: true });