import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule as ioInLoop } from '../no-io-in-loop.mts';

const ruleTester = typescriptRuleTester();

function inLoop(statement: string) {
  return `for (const id of ids) { ${statement} }`;
}

ruleTester.run('no-io-in-loop plain calls', ioInLoop, {
  valid: cases([
    inLoop("const text = sql.trim().replace(/\\s*;$/, ''); use(text);"),
    "const formatted = outputs.map((sql) => sql.trim().replace(/\\s*;$/, ''));",
    inLoop("const text = sqlQuery.sql.replace(/;\\s*$/, ''); use(text);"),
    inLoop("parts.push({ sql: joinSql.sql.replace('select * ', '').replace('where', 'and') });"),
    inLoop("baseSql = baseSql.trim().replaceAll(marker, '');"),
    inLoop('baseSql = baseSql.toString().replace(marker, (match) => match.toUpperCase());'),
    inLoop("const text = 'select ?'.replace(marker, 'x'); use(text);"),
    inLoop("const text = `select ${table}`.replace(marker, 'x'); use(text);"),
    inLoop("const text = String(value).replaceAll(marker, 'x'); use(text);"),
    inLoop("const text = JSON.stringify(value).replace(marker, 'x'); use(text);"),
    inLoop("const cleaned = query.sql.toLowerCase().split(';').join(' '); use(cleaned);"),
    inLoop("connection.send(JSON.stringify({ type: 'drain' }));"),
    inLoop('session.connection.send(HEARTBEAT);'),
    inLoop('this.socket.send(payload);'),
    inLoop(
      "const name = this.queryRunner.connection.driver.createParameter('p_' + id, 0); use(name);",
    ),
    inLoop('const map = this.queryRunner.connection.driver.createGeneratedMap(metadata, result);'),
  ]),
  invalid: [
    ...[
      inLoop('await repository.replace(id, { name });'),
      inLoop('await userRepository.replace(id, data);'),
      inLoop("await db.users.replace(id, 'x');"),
      inLoop("baseSql = baseSql.replaceAll(marker, '');"),
      inLoop('baseSql = baseSql.replace(marker, (match) => match.toUpperCase());'),
      inLoop("await userRepository.findOne({ id }).slice('comments', 5).exec();"),
      inLoop('await db.query(sql.trim());'),
      inLoop("await connection.query('select 1');"),
      inLoop("await connection.execute('select 1', [id]);"),
      inLoop('await sql.raw(id);'),
      inLoop('await pg.query(id);'),
    ].map((code) => ({ code, errors: [{ messageId: 'query' }] })),
    ...[
      inLoop('await client.send(command);'),
      inLoop('await this.api.send(id);'),
      inLoop('await httpClient.send(id);'),
    ].map((code) => ({ code, errors: [{ messageId: 'request' }] })),
  ],
});
