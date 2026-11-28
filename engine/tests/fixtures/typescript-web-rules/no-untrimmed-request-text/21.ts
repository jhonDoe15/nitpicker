import { Controller, Get, Query, Body, Param } from '@nestjs/common';
export function search(req: any, res: any, repo: any, db: any, prisma: any, c: any) {
  const q = req.query.q;
  repo.find({ where: { name: q } });
  const name = req.query.name as string;
  repo.findOneBy({ name });
  const { city, zip: postal, ...rest } = req.query;
  repo.search(city); repo.where(postal); repo.findByName(rest);
  const { userId } = req.query; repo.where(userId);
  const term = String(req.query.term ?? '');
  db.query('SELECT * FROM t WHERE name = $1', [term]);
  const t2 = (req.query.t2 || '').toLowerCase();
  repo.like(t2);
  repo.findBy({ title: req.query.title });
  repo.where(req.query.direct);
  repo.where(`${req.query.tpl}`);
  repo.where(req.query.cond ? req.query.a : req.query.b);
  repo.where((req.query.paren));
  repo.where(req.query.x.toLowerCase());
  repo.where((req.query.y.toLowerCase)());
  prisma.user.findMany({ where: { email: { contains: req.body.email } } });
  repo.findOneById(req.query.id);
  repo.eq(c.req.query('k'));
  repo.eq(req.query['bracket']);
  repo.eq(request.req.query.deep);
  const trimmed = req.query.tr; let tr2 = req.query.tr2; tr2 = tr2.trim(); repo.where(tr2); repo.where(trimmed);
  repo.where(String(req.query.s));
  sql`select ${req.query.tag}`;
  repo.where(req.query.n + 'x');
  repo.where('x' + req.query.m);
  repo.where(req.query.p!);
  repo.where(req.query.sat satisfies string);
  repo.where(<string>req.query.cast);
  repo.where(...req.query.spread);
  repo.where([req.query.arr]);
  db.all('select * where like ?', [req.query.sq]);
  db.run(`having x`, [req.query.sq2]);
  db.get('nothing', [req.query.sq3]);
  repo.findMany({ filter: { deep: { name: req.query.fd } } });
  repo.count({ name: req.query.cn });
  repo.find(x ? { name: req.query.tern } : null);
  repo.where(req?.query?.opt);
  repo?.where(req.query.optcall);
  repo.where(this.req.query.member);
  ({ where: { name: req.query.assign } } = obj);
}
@Controller() class K {
  @Get() a(@Query('q') q: string, repo: any) { repo.where(q); }
  @Get() b(@Query('q2') q: string | undefined, repo: any) { repo.where(q); }
  @Get() c(@Query('q3') q: string | null, repo: any) { repo.where(q); }
  @Get() d(@Query('q4') q: (string), repo: any) { repo.where(q); }
  @Get() e(@Body('b') q: string, repo: any) { repo.where(q); }
  @Get() f(@Param('p') q: string, repo: any) { repo.where(q); }
  @Get() g(@Query('q5') q: string, repo: any) { q = q.trim(); repo.where(q); }
  @Get() h(@Query('typeId') q: string, repo: any) { repo.where(q); }
  constructor(@Query('ctor') private q: string, repo: any) { repo.where(q); }
  @Get() i(@Query('def') q: string = '', repo: any) { repo.where(q); }
  @Get() j(@Query() q: string, repo: any) { repo.where(q); }
}
