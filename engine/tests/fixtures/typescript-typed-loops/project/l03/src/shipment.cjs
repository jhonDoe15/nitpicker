const { EntitySchema } = require('typeorm');
module.exports = new EntitySchema({ name: 'Shipment', relations: { carrier: { lazy: true }, first: { lazy: true } } });
