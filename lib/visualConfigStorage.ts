/**
 * Utility for saving and loading visual control configurations
 * Stores configurations in localStorage keyed by visual ID and configuration name
 */

import type { PrismHandControls } from '@/components/hand-tracking/PrismHandVisual';
import type { OneLineHandControls } from '@/components/hand-tracking/OneLineHandVisual';
import type { ConstellationControls } from '@/components/hand-tracking/ConstellationVisual';

export type VisualControlType = PrismHandControls | OneLineHandControls | ConstellationControls;

export interface SavedVisualConfig {
  id: string; // unique ID for this saved config
  name: string; // user-provided name
  visualId: string; // which visual this config belongs to (e.g., 'viz4', 'viz5', 'viz6')
  savedAt: number; // timestamp when saved
  controls: VisualControlType; // the actual control values
}

const STORAGE_PREFIX = 'visual-config';
const LIST_KEY_PREFIX = 'visual-config-list';

/**
 * Get the storage key for a specific saved configuration
 */
function getConfigKey(visualId: string, configId: string): string {
  return `${STORAGE_PREFIX}:${visualId}:${configId}`;
}

/**
 * Get the storage key for the list of saved configs for a visual
 */
function getListKey(visualId: string): string {
  return `${LIST_KEY_PREFIX}:${visualId}`;
}

/**
 * Get all saved configuration IDs for a specific visual
 */
function getSavedConfigIds(visualId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const listKey = getListKey(visualId);
    const stored = localStorage.getItem(listKey);
    if (!stored) return [];
    return JSON.parse(stored) as string[];
  } catch (error) {
    console.error('Error reading saved config list:', error);
    return [];
  }
}

/**
 * Save a list of config IDs for a visual
 */
function saveConfigIds(visualId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const listKey = getListKey(visualId);
    localStorage.setItem(listKey, JSON.stringify(ids));
  } catch (error) {
    console.error('Error saving config list:', error);
  }
}

/**
 * Save a visual configuration with a given name
 */
export function saveVisualConfig(
  visualId: string,
  name: string,
  controls: VisualControlType
): SavedVisualConfig {
  const configId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const savedConfig: SavedVisualConfig = {
    id: configId,
    name,
    visualId,
    savedAt: Date.now(),
    controls,
  };

  if (typeof window !== 'undefined') {
    try {
      const configKey = getConfigKey(visualId, configId);
      localStorage.setItem(configKey, JSON.stringify(savedConfig));
      
      // Add to the list of saved configs for this visual
      const existingIds = getSavedConfigIds(visualId);
      if (!existingIds.includes(configId)) {
        existingIds.push(configId);
        saveConfigIds(visualId, existingIds);
      }
    } catch (error) {
      console.error('Error saving visual config:', error);
      // If quota exceeded, try to clean up old configs
      if (error instanceof DOMException && error.code === 22) {
        console.warn('LocalStorage quota exceeded, attempting cleanup...');
        // Could implement cleanup logic here if needed
      }
    }
  }

  return savedConfig;
}

/**
 * Load all saved configurations for a specific visual
 */
export function loadSavedConfigs(visualId: string): SavedVisualConfig[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const configIds = getSavedConfigIds(visualId);
    const configs: SavedVisualConfig[] = [];
    
    for (const configId of configIds) {
      const configKey = getConfigKey(visualId, configId);
      const stored = localStorage.getItem(configKey);
      if (stored) {
        try {
          const config = JSON.parse(stored) as SavedVisualConfig;
          // Validate that it's for the correct visual
          if (config.visualId === visualId) {
            configs.push(config);
          }
        } catch (parseError) {
          console.error(`Error parsing config ${configId}:`, parseError);
        }
      }
    }
    
    // Sort by savedAt (newest first)
    configs.sort((a, b) => b.savedAt - a.savedAt);
    return configs;
  } catch (error) {
    console.error('Error loading saved configs:', error);
    return [];
  }
}

/**
 * Delete a saved configuration
 */
export function deleteSavedConfig(visualId: string, configId: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const configKey = getConfigKey(visualId, configId);
    localStorage.removeItem(configKey);
    
    // Remove from the list
    const existingIds = getSavedConfigIds(visualId);
    const filteredIds = existingIds.filter(id => id !== configId);
    saveConfigIds(visualId, filteredIds);
    
    return true;
  } catch (error) {
    console.error('Error deleting saved config:', error);
    return false;
  }
}

/**
 * Load a specific saved configuration by ID
 */
export function loadSavedConfig(visualId: string, configId: string): SavedVisualConfig | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const configKey = getConfigKey(visualId, configId);
    const stored = localStorage.getItem(configKey);
    if (!stored) return null;
    
    const config = JSON.parse(stored) as SavedVisualConfig;
    // Validate that it's for the correct visual
    if (config.visualId !== visualId) return null;
    return config;
  } catch (error) {
    console.error('Error loading saved config:', error);
    return null;
  }
}

/**
 * Check if a configuration name already exists for a visual
 */
export function configNameExists(visualId: string, name: string): boolean {
  const configs = loadSavedConfigs(visualId);
  return configs.some(config => config.name.toLowerCase() === name.toLowerCase());
}