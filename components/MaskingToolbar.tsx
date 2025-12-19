/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { useTranslations } from '../useTranslations';

interface MaskingToolbarProps {
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  isLoading: boolean;
}

const MaskingToolbar: React.FC<MaskingToolbarProps> = ({ 
  brushSize, 
  onBrushSizeChange, 
  isLoading 
}) => {
  const { t } = useTranslations();
  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex items-center gap-4 animate-fade-in backdrop-blur-sm">
        <label htmlFor="brush-size" className="text-sm font-medium text-gray-400 whitespace-nowrap">{t('brushSize')}:</label>
        <input
          id="brush-size"
          type="range"
          min="5"
          max="100"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          disabled={isLoading}
          className="w-full"
        />
        <span className="text-sm font-semibold text-gray-200 w-12 text-center bg-white/10 rounded-md py-1">{brushSize}</span>
    </div>
  );
};

export default React.memo(MaskingToolbar);