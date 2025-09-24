/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateBackgroundAlteredImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import BackgroundPanel from './components/BackgroundPanel';
import CropPanel from './components/CropPanel';
import MaskingToolbar from './components/MaskingToolbar';
import { UndoIcon, RedoIcon, EyeIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import { useTranslations } from './useTranslations';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'people' | 'background' | 'filters' | 'crop';
type MaskingTool = 'brush' | 'eraser';

const App: React.FC = () => {
  const { t } = useTranslations();
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  
  // Masking state
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [activeTool, setActiveTool] = useState<MaskingTool>('brush');
  
  // Cropping state
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  
  const [isComparing, setIsComparing] = useState<boolean>(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);

  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to create and revoke object URLs safely for the current image
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
  // Effect to create and revoke object URLs safely for the original image
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);
  
  // Effect to resize mask canvas to match the displayed image
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const image = imgRef.current;
    if (!['retouch', 'people'].includes(activeTab) || !canvas || !previewCanvas || !image) return;

    const setCanvasSize = () => {
        canvas.width = image.clientWidth;
        canvas.height = image.clientHeight;
        previewCanvas.width = image.clientWidth;
        previewCanvas.height = image.clientHeight;
    };

    if (image.complete) {
        setCanvasSize();
    } else {
        image.onload = setCanvasSize;
    }
    
    const resizeObserver = new ResizeObserver(setCanvasSize);
    resizeObserver.observe(image);

    return () => resizeObserver.disconnect();
  }, [currentImageUrl, activeTab]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  
  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (canvas) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasMask(false);
  }, []);

  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
    clearMask();
  }, [history, historyIndex, clearMask]);

  const handleImageUpload = useCallback((file: File) => {
    setError(null);
    setHistory([file]);
    setHistoryIndex(0);
    setActiveTab('retouch');
    setCrop(undefined);
    setCompletedCrop(undefined);
    clearMask();
  }, [clearMask]);

  const generateMaskFile = useCallback(async (): Promise<File | null> => {
    if (!maskCanvasRef.current || !imgRef.current) return null;

    const offscreenCanvas = document.createElement('canvas');
    const image = imgRef.current;
    offscreenCanvas.width = image.naturalWidth;
    offscreenCanvas.height = image.naturalHeight;
    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) throw new Error("Could not create offscreen canvas context.");
    
    ctx.drawImage(maskCanvasRef.current, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    const imageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha > 0) {
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
        } else {
            data[i] = 0; data[i+1] = 0; data[i+2] = 0;
        }
        data[i+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const maskDataUrl = offscreenCanvas.toDataURL('image/png');
    return dataURLtoFile(maskDataUrl, 'mask.png');
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!currentImage) return;
    if (!prompt.trim()) {
        setError(t('errorEnterDescription'));
        return;
    }
    if (!hasMask) {
        setError(t('errorPaintMask'));
        return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
        const maskFile = await generateMaskFile();
        if (!maskFile) {
          setError(t('errorCreateMask'));
          return;
        }

        const editedImageUrl = await generateEditedImage(currentImage, prompt, maskFile);
        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorGenerateFailed')} ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, hasMask, addImageToHistory, generateMaskFile, t]);
  
  const handleRemovePerson = useCallback(async () => {
    if (!currentImage) return;

    if (!hasMask) {
        setError(t('errorPaintMaskPerson'));
        return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
        const maskFile = await generateMaskFile();
        if (!maskFile) {
            setError(t('errorCreateMask'));
            return;
        }
        const removePrompt = "Realistically and seamlessly remove the person in the masked area, intelligently filling in the background.";
        const editedImageUrl = await generateEditedImage(currentImage, removePrompt, maskFile);
        const newImageFile = dataURLtoFile(editedImageUrl, `removed-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorRemovePersonFailed')} ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, hasMask, addImageToHistory, generateMaskFile, t]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorApplyFilterFailed')} ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, t]);
  
  const handleApplyBackgroundChange = useCallback(async (backgroundPrompt: string) => {
    if (!currentImage) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateBackgroundAlteredImage(currentImage, backgroundPrompt);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `background-${Date.now()}.png`);
        addImageToHistory(newImageFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorBackgroundChangeFailed')} ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, t]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
        setError(t('errorSelectCropArea'));
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        setError(t('errorProcessCrop'));
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
    addImageToHistory(newImageFile);

  }, [completedCrop, addImageToHistory, t]);
  
  // --- MASK DRAWING HANDLERS ---
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number, y: number } | null => {
      const canvas = maskCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
      };
  };

  const clearBrushPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCoords(e);
      if (!coords) return;
      setIsDrawing(true);
      lastPosition.current = coords;
      clearBrushPreview();
  }, [clearBrushPreview]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      const coords = getCoords(e);
      const canvas = maskCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!coords || !ctx || !lastPosition.current) return;
      
      ctx.beginPath();
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (activeTool === 'brush') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(75, 128, 255, 0.7)';
      } else { // eraser
        ctx.globalCompositeOperation = 'destination-out';
      }
      
      ctx.moveTo(lastPosition.current.x, lastPosition.current.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      
      lastPosition.current = coords;

  }, [isDrawing, brushSize, activeTool]);
  
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPosition.current = null;
    if (maskCanvasRef.current) {
        const context = maskCanvasRef.current.getContext('2d');
        if (context) {
            const imageData = context.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
            const hasContent = imageData.data.some(channel => channel !== 0);
            setHasMask(hasContent);
        }
    }
  }, []);

  const drawBrushPreview = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const coords = getCoords(e);
    if (!ctx || !coords) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [brushSize]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing) {
      draw(e);
    } else {
      drawBrushPreview(e);
    }
  }, [isDrawing, draw, drawBrushPreview]);

  const handleMouseLeave = useCallback(() => {
    stopDrawing();
    clearBrushPreview();
  }, [stopDrawing, clearBrushPreview]);


  // --- HISTORY HANDLERS ---
  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
      clearMask();
    }
  }, [canUndo, historyIndex, clearMask]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
      clearMask();
    }
  }, [canRedo, historyIndex, clearMask]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
      clearMask();
    }
  }, [history, clearMask]);

  const handleUploadNew = useCallback(() => {
      setHistory([]);
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      clearMask();
  }, [clearMask]);

  const handleDownload = useCallback(() => {
      if (currentImage) {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(currentImage);
          link.download = `edited-${currentImage.name}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
      }
  }, [currentImage]);
  
  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      handleImageUpload(files[0]);
    }
  };

  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">{t('errorOccurred')}</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                {t('tryAgain')}
            </button>
          </div>
        );
    }
    
    if (!currentImageUrl) {
      return <StartScreen onFileSelect={handleFileSelect} />;
    }

    const imageDisplayWithCompare = (
      <div className="relative">
        {originalImageUrl && (
            <img
                key={originalImageUrl}
                src={originalImageUrl}
                alt="Original"
                className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
            />
        )}
        <img
            ref={imgRef}
            key={currentImageUrl}
            src={currentImageUrl}
            alt="Current"
            className={`absolute top-0 left-0 w-full h-auto object-contain max-h-[60vh] rounded-xl transition-opacity duration-200 ease-in-out ${isComparing ? 'opacity-0' : 'opacity-100'}`}
        />
      </div>
    );

    const imageDisplayForMasking = (
      <div className="relative cursor-none">
        <img
          ref={imgRef}
          key={`masking-${currentImageUrl}`}
          src={currentImageUrl}
          alt="Edit this image"
          className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
        />
        <canvas
            ref={maskCanvasRef}
            onMouseDown={startDrawing}
            onMouseMove={handleMouseMove}
            onMouseUp={stopDrawing}
            onMouseLeave={handleMouseLeave}
            className="absolute top-0 left-0 w-full h-full"
        />
        <canvas
            ref={previewCanvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
      </div>
    );
    
    const cropImageElement = (
      <img 
        ref={imgRef}
        key={`crop-${currentImageUrl}`}
        src={currentImageUrl} 
        alt="Crop this image"
        className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
      />
    );

    return (
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20">
            {isLoading && (
                <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">{t('aiWorking')}</p>
                </div>
            )}
            
            {activeTab === 'crop' ? (
              <ReactCrop 
                crop={crop} 
                onChange={c => setCrop(c)} 
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-[60vh]"
              >
                {cropImageElement}
              </ReactCrop>
            ) : ['retouch', 'people'].includes(activeTab) ? imageDisplayForMasking : imageDisplayWithCompare }
        </div>
        
        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
            {(['retouch', 'people', 'background', 'filters', 'crop'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full capitalize font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {t(tab)}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4">
                    <MaskingToolbar 
                        brushSize={brushSize}
                        onBrushSizeChange={setBrushSize}
                        activeTool={activeTool}
                        onToolChange={setActiveTool}
                        onClearMask={clearMask}
                        isLoading={isLoading}
                    />
                    <p className="text-md text-gray-400">
                        {hasMask ? t('promptDescribeEdit') : t('promptPaintMask')}
                    </p>
                    <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex items-center gap-2">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={hasMask ? t('placeholderRetouch') : t('placeholderPaintFirst')}
                            className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isLoading || !hasMask}
                        />
                        <button 
                            type="submit"
                            className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={isLoading || !prompt.trim() || !hasMask}
                        >
                            {t('generate')}
                        </button>
                    </form>
                </div>
            )}
            {activeTab === 'people' && (
              <div className="flex flex-col items-center gap-4">
                <MaskingToolbar 
                    brushSize={brushSize}
                    onBrushSizeChange={setBrushSize}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onClearMask={clearMask}
                    isLoading={isLoading}
                />
                <p className="text-md text-gray-400">
                    {t('promptPaintMaskPerson')}
                </p>
                <button
                    onClick={handleRemovePerson}
                    className="w-full max-w-md bg-gradient-to-br from-red-600 to-red-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-red-800 disabled:to-red-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                    disabled={isLoading || !hasMask}
                >
                    {t('removePerson')}
                </button>
              </div>
            )}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
            {activeTab === 'background' && <BackgroundPanel onApplyBackgroundChange={handleApplyBackgroundChange} isLoading={isLoading} />}
            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button 
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                {t('undo')}
            </button>
            <button 
                onClick={handleRedo}
                disabled={!canRedo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                {t('redo')}
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
              <button 
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                  aria-label={t('compareAria')}
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  {t('compare')}
              </button>
            )}

            <button 
                onClick={handleReset}
                disabled={!canUndo}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                {t('reset')}
            </button>
            
            <button 
                onClick={handleDownload}
                className="flex-grow sm:flex-grow-0 ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
            >
                {t('downloadImage')}
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header onHomeClick={handleUploadNew} />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${currentImage ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;