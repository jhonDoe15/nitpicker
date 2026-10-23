export function handler(body, caught = 'asyncio.CancelledError', imports = 'import asyncio') {
  return [
    imports,
    'async def run(operation, ready):',
    '    try:',
    '        await operation()',
    `    except ${caught} as error:`,
    ...body.split('\n').map((line) => `        ${line}`),
    '',
  ].join('\n');
}

export const lost = ['cancellation-not-propagated:5 except asyncio.CancelledError'];
