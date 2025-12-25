'use client';

import { useState, useEffect } from 'react';
import {
  saveVisualConfig,
  loadSavedConfigs,
  deleteSavedConfig,
  configNameExists,
  type SavedVisualConfig,
} from '@/lib/visualConfigStorage';
import type { PrismHandControls } from './PrismHandVisual';
import type { OneLineHandControls } from './OneLineHandVisual';
import type { ConstellationControls } from './ConstellationVisual';

type VisualControlType = PrismHandControls | OneLineHandControls | ConstellationControls;

interface ConfigSaveLoadCompactProps {
  visualId: string;
  currentControls: VisualControlType;
  onLoadConfig: (controls: VisualControlType) => void;
}

export function ConfigSaveLoadCompact({ visualId, currentControls, onLoadConfig }: ConfigSaveLoadCompactProps) {
  const [savedConfigs, setSavedConfigs] = useState<SavedVisualConfig[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved configs when component mounts or visualId changes
  useEffect(() => {
    const configs = loadSavedConfigs(visualId);
    setSavedConfigs(configs);
  }, [visualId]);

  const handleSave = () => {
    if (!saveName.trim()) {
      setSaveError('Name required');
      return;
    }

    if (configNameExists(visualId, saveName.trim())) {
      setSaveError('Name exists');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const saved = saveVisualConfig(visualId, saveName.trim(), currentControls);
      setSavedConfigs((prev) => [saved, ...prev]);
      setSaveName('');
    } catch (error) {
      console.error('Error saving config:', error);
      setSaveError('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (config: SavedVisualConfig) => {
    onLoadConfig(config.controls);
    setIsExpanded(false);
  };

  const handleDelete = (configId: string) => {
    if (confirm('Delete this configuration?')) {
      deleteSavedConfig(visualId, configId);
      setSavedConfigs((prev) => prev.filter((c) => c.id !== configId));
    }
  };

  return (
    <div className="space-y-2 border-t border-gray-700 pt-2 mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left text-xs text-gray-300 hover:text-white font-medium"
      >
        {isExpanded ? '▼' : '▶'} Saved Configs ({savedConfigs.length})
      </button>

      {isExpanded && (
        <div className="space-y-2 text-xs">
          {/* Save section */}
          <div className="space-y-1">
            <div className="flex gap-1">
              <input
                type="text"
                placeholder="Config name..."
                value={saveName}
                onChange={(e) => {
                  setSaveName(e.target.value);
                  setSaveError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                  }
                }}
                className="flex-1 px-2 py-1 rounded bg-gray-800 text-white text-xs border border-gray-700 focus:outline-none focus:border-gray-600"
              />
              <button
                onClick={handleSave}
                disabled={isSaving || !saveName.trim()}
                className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? '...' : 'Save'}
              </button>
            </div>
            {saveError && (
              <div className="text-red-400 text-[10px]">{saveError}</div>
            )}
          </div>

          {/* Saved configs list */}
          {savedConfigs.length === 0 ? (
            <div className="text-gray-500 text-[10px] py-1">No saved configs</div>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {savedConfigs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between gap-1 p-1 rounded bg-gray-800/50 hover:bg-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate text-[10px]">{config.name}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleLoad(config)}
                      className="px-1.5 py-0.5 rounded bg-green-600/80 text-white text-[10px] hover:bg-green-600"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="px-1.5 py-0.5 rounded bg-red-600/80 text-white text-[10px] hover:bg-red-600"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}