import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import { rejectUnreadableSources as untypedRejectUnreadableSources } from './project-config.mjs';
import {
  detectedPreset as untypedDetectedPreset,
  rejectUndeclaredPreset as untypedRejectUndeclaredPreset,
} from './preset-detection.mjs';
import {
  markerFilesIn as untypedMarkerFilesIn,
  rejectMissingBuildFiles as untypedRejectMissingBuildFiles,
} from './project-markers.mjs';

type DetectedPreset = {
  readonly preset: string;
  readonly label: string;
  readonly file: string;
};

export const markerFilesIn: (projectRoot: string, files: readonly string[]) => string[] =
  untypedMarkerFilesIn;

export const detectedPreset: (projectRoot: string) => DetectedPreset | undefined =
  untypedDetectedPreset;

export const rejectUnreadableSources: (config: NitpickerConfig, projectRoot: string) => void =
  untypedRejectUnreadableSources;

export const rejectUndeclaredPreset: (config: NitpickerConfig, projectRoot: string) => void =
  untypedRejectUndeclaredPreset;

export const rejectMissingBuildFiles: (config: NitpickerConfig, projectRoot: string) => void =
  untypedRejectMissingBuildFiles;
