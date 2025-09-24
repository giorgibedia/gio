/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { BrushIcon, EraserIcon } from './icons';
import { useTranslations } from '../useTranslations';

type MaskingTool = 'brush' | 'eraser';

interface MaskingToolbarProps {
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  activeTool: MaskingTool;
  onToolChange: (tool: MaskingTool) => void;
  onClearMask: () => void;
  isLoading: boolean;
}

const MaskingToolbar: React.FC<MaskingToolbarProps> = ({ 
  brushSize, 
  onBrushSizeChange, 
  activeTool, 
  onToolChange, 
  onClearMask,
  isLoading 
}) => {
  const { t } = useTranslations();
  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToolChange('brush')}
          disabled={isLoading}
          className={`p-3 rounded-md transition-colors duration-200 ${activeTool === 'brush' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
          aria-label="Select Brush Tool"
        >
          <BrushIcon className="w-6 h-6" />
        </button>
        <button
          onClick={() => onToolChange('eraser')}
          disabled={isLoading}
          className={`p-3 rounded-md transition-colors duration-200 ${activeTool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
          aria-label="Select Eraser Tool"
        >
          <EraserIcon className="w-6 h-6" />
        </button>
      </div>

      <div className="flex items-center gap-3 w-full md:w-auto">
        <label htmlFor="brush-size" className="text-sm font-medium text-gray-400 whitespace-nowrap">{t('brushSize')}:</label>
        <input
          id="brush-size"
          type="range"
          min="5"
          max="100"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          disabled={isLoading}
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm font-semibold text-gray-200 w-8 text-center">{brushSize}</span>
      </div>

      <button
        onClick={onClearMask}
        disabled={isLoading}
        className="w-full md:w-auto text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-2 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 active:scale-95 text-base disabled:opacity-50"
      >
        {t('clearMask')}
      </button>
    </div>
  );
};

export default MaskingToolbar;