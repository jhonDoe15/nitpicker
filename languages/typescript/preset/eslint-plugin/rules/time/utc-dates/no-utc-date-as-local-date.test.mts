import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-utc-date-as-local-date.mts';

const tester = typescriptRuleTester({ ecmaFeatures: { jsx: true } });
const UTC = [{ messageId: 'utcDate' }];
const TODAY = 'new Date().toISOString().split("T")[0]';
const component = (body: string) => `function Filter() { ${body} return null; }`;

tester.run('no-utc-date-as-local-date', rule, {
  valid: [
    `const name = \`export_\${${TODAY}}.csv\`;`,
    `const today = ${TODAY}; const name = "visits-" + today + ".csv";`,
    `const key = ${TODAY}; cache.set(key, rows);`,
    `const entry = { url, lastModified: ${TODAY} };`,
    `const row = { date: ${TODAY}, count: 1 };`,
    `const range = { startDate: ${TODAY}, endDate: ${TODAY} };`,
    `const date = ${TODAY}; if (date !== currentDate) { rotate(date); }`,
    `logger.info(${TODAY});`,
    `const day = candidate || ${TODAY};`,
    `const day = lastupdate ?? ${TODAY};`,
    component(
      'let now = new Date(); now = new Date(row.at); const [d, setD] = useState(now.toISOString().slice(0, 10));',
    ),
    component(
      'const at = new Date(); at.setTime(row.at); const [d, setD] = useState(at.toISOString().slice(0, 10));',
    ),
    component(
      `const [state, dispatch] = useReducer((s, a) => ({ ...s, issued: ${TODAY} }), initial);`,
    ),
    component(
      `const form = useFormik({ onSubmit: (values) => send({ ...values, filedOn: ${TODAY} }) });`,
    ),
    component(`const [state, setState] = useState({ later: () => ${TODAY} });`),
    `function create({ dueDate = ${TODAY} }) { return dueDate; }`,
    `function logName(date = ${TODAY}) { return "log-" + date + ".txt"; }`,
    component(`let day = ${TODAY}; day = other(); const [shown, setShown] = useState(day);`),
    `const day = options.day ?? ${TODAY};`,
    `const partition = options.partition || ${TODAY};`,
    `const ready = options.startDate && ${TODAY};`,
    component('const [day, setDay] = useState(created.toISOString().split("T")[0]);'),
    component(
      'const [day, setDay] = useState(new Date(row.createdAt).toISOString().slice(0, 10));',
    ),
    component(
      'const [day, setDay] = useState(new Date(Date.UTC(2026, 0, 1)).toISOString().slice(0, 10));',
    ),
    component('const [stamp, setStamp] = useState(new Date().toISOString());'),
    component('const [time, setTime] = useState(new Date().toISOString().split("T")[1]);'),
    component('const [time, setTime] = useState(new Date().toISOString().slice(11, 19));'),
    component('const [year, setYear] = useState(new Date().toISOString().slice(0, 4));'),
    component('const [parts, setParts] = useState(new Date().toISOString().split("-")[0]);'),
    component('const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));'),
    component(
      'const [day, setDay] = useState(new Intl.DateTimeFormat("en-CA").format(new Date()));',
    ),
    component(
      'const now = new Date(); now.setUTCDate(now.getUTCDate() - 7); const [day, setDay] = useState(now.toISOString().slice(0, 10));',
    ),
    component(`const [name, setName] = useState(\`report-\${${TODAY}}\`);`),
    component(`const [day, setDay] = useState(pick(${TODAY}));`),
    component(`const today = ${TODAY}; return <a download={today + ".csv"} />;`),
    component(`return <input type="text" defaultValue={${TODAY}} />;`),
    component(`return <input type="date" name={${TODAY}} />;`),
    component(`return <input type={kind} max={${TODAY}} />;`),
    component(`track(${TODAY});`),
  ],
  invalid: [
    { code: component(`const [startDate, setStartDate] = useState(${TODAY});`), errors: UTC },
    {
      code: component(`const [startDate, setStartDate] = useState<string>(${TODAY});`),
      errors: UTC,
    },
    {
      code: component(
        'const [day, setDay] = React.useState(new Date().toISOString().slice(0, 10));',
      ),
      errors: UTC,
    },
    {
      code: component(
        'const [day, setDay] = useState(() => new Date().toISOString().substring(0, 10));',
      ),
      errors: UTC,
    },
    {
      code: component(
        'const [day, setDay] = useState(new Date(Date.now()).toISOString().substr(0, 10));',
      ),
      errors: UTC,
    },
    {
      code: component(`const [range, setRange] = useState({ from: ${TODAY}, to: ${TODAY} });`),
      errors: [...UTC, ...UTC],
    },
    {
      code: component(
        `const form = useForm({ defaultValues: { issueDate: ${TODAY}, notes: "" } });`,
      ),
      errors: UTC,
    },
    {
      code: component(`const today = ${TODAY}; const [day, setDay] = useState(initial ?? today);`),
      errors: UTC,
    },
    {
      code: component(
        'const now = new Date(); now.setDate(now.getDate() - 7); const [day, setDay] = useState(now.toISOString().split("T")[0]);',
      ),
      errors: UTC,
    },
    { code: component(`return <input type="date" defaultValue={${TODAY}} />;`), errors: UTC },
    {
      code: component(
        `const today = ${TODAY}; return <input type="date" min="2020-01-01" max={today} />;`,
      ),
      errors: UTC,
    },
    {
      code: component(`return <Input type="date" value={value ?? ${TODAY}} onChange={change} />;`),
      errors: UTC,
    },
    { code: `const invoice = { issueDate: opts.issueDate || ${TODAY} };`, errors: UTC },
    { code: `const date = opts.date ?? ${TODAY};`, errors: UTC },
    { code: component(`const [days, setDays] = useState([${TODAY}]);`), errors: UTC },
    { code: component(`const [day, setDay] = useState(open ? ${TODAY} : "");`), errors: UTC },
    {
      code: component(`const [state, dispatch] = useReducer(reduce, { issued: ${TODAY} });`),
      errors: UTC,
    },
    {
      code: `const today = ${TODAY}; const payload = { VoidDate: voidDate || today };`,
      errors: UTC,
    },
  ],
});
