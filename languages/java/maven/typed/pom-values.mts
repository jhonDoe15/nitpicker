import {
  childAt as readChildAt,
  childrenAt as readChildrenAt,
} from '../../../../shared/ingest/common.mjs';
import type { XmlElement } from '../../../../shared/values/xml.mts';
import {
  executionsOf as readExecutionsOf,
  executionsWithGoal as readExecutionsWithGoal,
  goalsOf as readGoalsOf,
  pluginsOf as readPluginsOf,
  textAt as readTextAt,
} from '../configuration/pom-elements.mjs';

export const childAt: (
  element: XmlElement | undefined,
  ...names: readonly string[]
) => XmlElement | undefined = readChildAt;
export const childrenAt: (
  element: XmlElement | undefined,
  ...names: readonly string[]
) => XmlElement[] = readChildrenAt;
export const textAt: (
  element: XmlElement | undefined,
  ...names: readonly string[]
) => string | undefined = readTextAt;
export const pluginsOf: (project: XmlElement) => Map<string, XmlElement> = readPluginsOf;
export const executionsWithGoal: (plugin: XmlElement, goal: string) => XmlElement[] =
  readExecutionsWithGoal;
export const executionsOf: (plugin: XmlElement) => XmlElement[] = readExecutionsOf;
export const goalsOf: (execution: XmlElement) => (string | undefined)[] = readGoalsOf;
