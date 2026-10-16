import { precedenceLayers } from '../../../shared/tool-precedence.mjs';
import { detectFormatter } from '../adapters/execution/python-project.mjs';
import { readBlackConfig, readRuffConfig } from '../adapters/formatting/project-format-config.mjs';
import { PYTHON_INDENTATION, PYTHON_LINE_LENGTH, PYTHON_QUOTES } from './python-conventions.mjs';

const IDS = {
  lineLength: PYTHON_LINE_LENGTH,
  quotes: PYTHON_QUOTES,
  indentation: PYTHON_INDENTATION,
};
const BLACK_QUOTES = { preserve: 'single', normalize: 'double' };
const BLACK_NOTE = 'black accepts both quote styles';

function projectChoices(formatter, project) {
  if (project === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(project.set).map(([key, value]) => [
      IDS[key],
      {
        choice: formatter === 'black' && key === 'quotes' ? BLACK_QUOTES[value] : String(value),
        from: `your ${formatter} config`,
      },
    ]),
  );
}

export function pythonStyle({ config, projectRoot }) {
  const formatter = detectFormatter(projectRoot, config.python?.formatter);
  const layers = precedenceLayers(config.tools?.[formatter]?.precedence);
  const read = formatter === 'black' ? readBlackConfig : readRuffConfig;
  const project = layers.usesProject && !layers.nitpickerFirst ? read(projectRoot) : undefined;
  return {
    unused:
      formatter === 'black' ? { [PYTHON_INDENTATION]: 'black has no indentation setting' } : {},
    project: projectChoices(formatter, project),
    note: (id, choice) =>
      formatter === 'black' && id === PYTHON_QUOTES && choice === 'single' ? BLACK_NOTE : undefined,
  };
}
