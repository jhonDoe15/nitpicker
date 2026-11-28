const { Sequelize } = require('sequelize');
sequelize.define('order', {}, { defaultScope: { include: [Customer] } });