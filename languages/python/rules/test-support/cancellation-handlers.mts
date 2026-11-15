export function handler(
  body: string,
  caught = 'asyncio.CancelledError',
  imports = 'import asyncio',
): string {
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
