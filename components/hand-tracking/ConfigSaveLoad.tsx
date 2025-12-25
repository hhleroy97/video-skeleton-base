'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ConfigSaveLoadProps {
  visualId: string;
  currentControls: VisualControlType;
  onLoadConfig: (controls: VisualControlType) => void;
}

export function ConfigSaveLoad({ visualId, currentControls, onLoadConfig }: ConfigSaveLoadProps) {
  const [savedConfigs, setSavedConfigs] = useState<SavedVisualConfig[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved configs when component mounts or visualId changes
  useEffect(() => {
    const configs = loadSavedConfigs(visualId);
    setSavedConfigs(configs);
  }, [visualId]);

  const handleSave = () => {
    if (!saveName.trim()) {
      setSaveError('Please enter a name for this configuration');
      return;
    }

    if (configNameExists(visualId, saveName.trim())) {
      setSaveError('A configuration with this name already exists');
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
      setSaveError('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (config: SavedVisualConfig) => {
    onLoadConfig(config.controls);
  };

  const handleDelete = (configId: string) => {
    if (confirm('Are you sure you want to delete this configuration?')) {
      deleteSavedConfig(visualId, configId);
      setSavedConfigs((prev) => prev.filter((c) => c.id !== configId));
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Configurations</CardTitle>
        <CardDescription>
          Save your current settings to reuse later
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Save section */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Configuration name..."
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-black"
            />
            <Button
              onClick={handleSave}
              disabled={isSaving || !saveName.trim()}
              size="sm"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
          {saveError && (
            <p className="text-sm text-red-600">{saveError}</p>
          )}
        </div>

        {/* Saved configs list */}
        {savedConfigs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No saved configurations yet. Save your current settings above.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {savedConfigs.map((config) => (
              <div
                key={config.id}
                className="flex items-center justify-between p-2 border border-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{config.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(config.savedAt)}
                  </div>
                </div>
                <div className="flex gap-2 ml-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLoad(config)}
                  >
                    Load
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(config.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}