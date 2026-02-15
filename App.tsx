
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { generateEditedImage, generateBackgroundAlteredImage, saveImageToGallery, generateImageFromText, generateMagicEdit, composeImages, generateLogo, dataURLtoFile, enhancePrompt } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import MaskingToolbar from './components/MaskingToolbar';
import { UndoIcon, RedoIcon, EyeIcon, MagicWandIcon, PhotoIcon, BrushIcon, EraserIcon, CloudArrowUpIcon, SparkleIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import { useTranslations } from './useTranslations';
import Assistant from './components/Assistant';
import { init as initAnalytics } from './services/analyticsService';
import { useAuth } from './AuthContext';
import LoadingScreen from './components/LoadingScreen';

// Lazy load components for better performance
const BackgroundPanel = lazy(() => import('./components/BackgroundPanel'));
const MagicPanel = lazy(() => import('./components/MagicPanel'));
const LogoMakerPanel = lazy(() => import('./components/LogoMakerPanel'));
const AboutScreen = lazy(() => import('./components/AboutScreen'));
const AdminPanelScreen = lazy(() => import('./components/AiPanelScreen'));
const AuthScreen = lazy(() => import('./components/AuthScreen'));
const BetaDisclaimer = lazy(() => import('./components/BetaDisclaimer'));
const ProfileSettingsScreen = lazy(() => import('./components/ProfileSettingsScreen'));
// GalleryScreen is a named export, so it needs a special import syntax for lazy loading
const GalleryScreenLazy = lazy(() => import('./components/StartScreen').then(module => ({ default: module.GalleryScreen })));



// Helper to convert a File object to a data URL string.
const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

/**
 * Processes an image file by resizing it.
 * CRITICAL FIX: Reduced max dimension to 1024px.
 * The Free Tier API quota is extremely sensitive to total pixel count/tokens.
 * 1024px is the industry standard for input images to generative models to ensure stability.
 */
const processImageFile = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const maxDimension = 1024; // Reduced to 1024px for maximum stability on Free Tier
    console.log(`Processing image with max dimension: ${maxDimension}px (Optimized for Free Tier)`);

    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result || typeof e.target.result !== 'string') {
        return reject(new Error('FileReader did not return a valid data URL.'));
      }

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Determine new dimensions if resizing is needed
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          return reject(new Error('Could not get 2D context from canvas for image processing.'));
        }
        
        // Fill background with white before drawing. This is crucial for converting images 
        // with transparency (like PNG) to JPEG, which doesn't support transparency.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.drawImage(img, 0, 0, width, height);

        // Quality 0.9 is sufficient for input images
        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('Failed to convert canvas to blob during processing.'));
          }
          
          // Create a safe filename
          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || `image-${Date.now()}`;
          const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpeg';

          const processedFile = new File([blob], safeName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(processedFile);
        }, 'image/jpeg', 0.9);
      };

      img.onerror = (error) => {
        console.error("Image loading from data URL error:", error);
        reject(new Error(`The image could not be loaded. It may be corrupt or in an unsupported format.`));
      };

      img.src = e.target.result;
    };

    reader.onerror = (error) => {
      console.error("FileReader error:", error);
      reject(new Error('The selected image could not be read. Please try a different file.'));
    };

    reader.readAsDataURL(file);
  });
};


// Helper function to add a watermark to an image data URL
const addWatermark = (dataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        return reject(new Error('Could not get 2D context from canvas for watermarking.'));
      }

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // --- Smart Watermark Check ---
      // Check for a magic pixel at (0, 0) to see if watermark already exists
      const markerPixel = ctx.getImageData(0, 0, 1, 1).data;
      // R=1, G=2, B=3, A=255 is our unique marker
      if (markerPixel[0] === 1 && markerPixel[1] === 2 && markerPixel[2] === 3 && markerPixel[3] === 255) {
        console.log("Watermark already exists. Skipping.");
        resolve(dataUrl); // Resolve with the original image
        return;
      }

      // --- Watermark styling ---
      // Make font size proportional to image height, with a minimum size
      const fontSize = Math.max(14, Math.round(canvas.height * 0.025)); 
      ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // White with 50% opacity
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      
      // --- Watermark position ---
      const margin = Math.round(canvas.height * 0.02); // Margin proportional to image size
      const x = canvas.width - margin;
      const y = canvas.height - margin;

      // Draw the watermark text
      ctx.fillText('By G.B', x, y);

      // --- Add the magic pixel marker ---
      ctx.fillStyle = 'rgba(1, 2, 3, 1)'; // Our unique, nearly invisible marker color
      ctx.fillRect(0, 0, 1, 1);

      // Get the new data URL and resolve
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      reject(new Error('Image could not be loaded for watermarking.'));
    };
    img.src = dataUrl;
  });
};


type Tab = 'retouch' | 'background' | 'magic' | 'logoMaker';
type MaskingTool = 'brush' | 'eraser';
type Page = 'main' | 'about' | 'gallery' | 'settings';

const App: React.FC = () => {
  const { t } = useTranslations();
  const { user, loading: isAuthLoading } = useAuth();
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  const [page, setPage] = useState<Page>('main');
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  
  // Admin & AI Panel State
  const [isAdminView, setIsAdminView] = useState(() => {
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        return params.get('panel') === 'secure_dashboard';
    }
    return false;
  });

  const [showAuthScreen, setShowAuthScreen] = useState<boolean>(false);
  const [showScrollFade, setShowScrollFade] = useState(false);

  // Masking state
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [activeTool, setActiveTool] = useState<MaskingTool>('brush');
  
  // Magic Panel State
  const [secondImage, setSecondImage] = useState<string | null>(null);
  
  // Logo Maker State
  const [logoInProgress, setLogoInProgress] = useState<string | null>(null);
  const [logoBackgroundImage, setLogoBackgroundImage] = useState<string | null>(null);
  
  const [isComparing, setIsComparing] = useState<boolean>(false);
  
  const imgRef = useRef<HTMLImageElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);
  const isCancelledRef = useRef(false);

  // Pan & Zoom state
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [viewTransform, setViewTransform] = useState<{ scale: number; x: number; y: number; }>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef<Map<number, { x: number, y: number }>>(new Map());
  const panStartCoords = useRef<{ x: number; y: number; }>({ x: 0, y: 0 });
  const lastPan = useRef<{ x: number; y: number; }>({ x: 0, y: 0 });
  const pinchStartDist = useRef(0);
  const lastScale = useRef(1);
  
  const [isMobile, setIsMobile] = useState(false);

  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  useEffect(() => {
    const savedTheme = localStorage.getItem('appTheme') || 'blue';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  useEffect(() => {
    if (!isAuthLoading) {
        setIsFadingOut(true);
        const timer = setTimeout(() => {
            setIsAppLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [isAuthLoading]);

  useEffect(() => {
    if (currentImage) {
        document.body.classList.add('editing');
    } else {
        document.body.classList.remove('editing');
    }
  }, [currentImage]);
  
  useEffect(() => {
    const checkIsMobile = () => {
        const mobileCheck = window.matchMedia('(pointer: coarse)').matches;
        setIsMobile(mobileCheck);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;

    if (isAdminView) {
        document.body.classList.add('admin-view');
    } else {
        document.body.classList.remove('admin-view');
    }
    initAnalytics();
  }, [isAdminView, isAuthLoading]);

  useEffect(() => {
    const welcomeScreenAccepted = localStorage.getItem('welcomeScreenAccepted');
    if (welcomeScreenAccepted !== 'true') {
      setShowWelcomeScreen(true);
    }
  }, []);
  
  const isDrawingTabActive = activeTab === 'retouch';
  
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const image = imgRef.current;
    if (!isDrawingTabActive || !canvas || !previewCanvas || !image) return;

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
  }, [currentImage, activeTab, isDrawingTabActive]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const resetView = useCallback(() => {
    setViewTransform({ scale: 1, x: 0, y: 0 });
    lastScale.current = 1;
    lastPan.current = { x: 0, y: 0 };
    pointers.current.clear();
  }, []);

  useEffect(() => {
    resetView();
  }, [currentImage, activeTab, resetView]);
  
  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (canvas) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasMask(false);
  }, []);
  
  const checkScroll = useCallback(() => {
    const el = toolbarRef.current;
    if (el) {
        const isScrollable = el.scrollWidth > el.clientWidth;
        const isScrolledToEnd = el.scrollWidth - el.scrollLeft - el.clientWidth < 1;
        setShowScrollFade(isScrollable && !isScrolledToEnd);
    }
  }, []);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', checkScroll);
        observer.disconnect();
    };
  }, [currentImage, checkScroll]);

  const addImageToHistory = useCallback((newImageDataUrl: string) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageDataUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    clearMask();
  }, [history, historyIndex, clearMask]);

  const handleImageUpload = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);
    try {
        const processedFile = await processImageFile(file);
        const imageUrl = await fileToDataUrl(processedFile);
        setHistory([imageUrl]);
        setHistoryIndex(0);
        setActiveTab('retouch');
        setPage('main');
        clearMask();
        resetView();
    } catch (err) {
        console.error("Image processing failed:", err);
        const errorMessage = err instanceof Error ? err.message : 'The selected image could not be loaded.';
        setError(errorMessage);
        setHistory([]);
        setHistoryIndex(-1);
    } finally {
        setIsLoading(false);
    }
  }, [clearMask, resetView]);

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
    return await dataURLtoFile(maskDataUrl, 'mask.png');
  }, []);

  const handleCancelGeneration = useCallback(() => {
    isCancelledRef.current = true;
    setIsLoading(false);
  }, []);

  const handleEnhancePrompt = useCallback(async (currentPrompt: string, contextImage?: string | null): Promise<string> => {
    if (!currentPrompt.trim()) return currentPrompt;
    
    setIsEnhancing(true);
    setError(null);
    try {
        const enhanced = await enhancePrompt(currentPrompt, contextImage);
        return enhanced;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorEnhanceFailed')} ${errorMessage}`);
        return currentPrompt;
    } finally {
        setIsEnhancing(false);
    }
  }, [t]);

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

    isCancelledRef.current = false;
    setIsLoading(true);
    setError(null);
    
    try {
        const maskFile = await generateMaskFile();
        if (!maskFile) {
          setError(t('errorCreateMask'));
          return;
        }

        const editedImageUrl = await generateEditedImage(currentImage, prompt, maskFile);
        if (isCancelledRef.current) return;
        
        const watermarkedImageUrl = await addWatermark(editedImageUrl);
        addImageToHistory(watermarkedImageUrl);
    } catch (err) {
        if (isCancelledRef.current) return;
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorGenerateFailed')} ${errorMessage}`);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, hasMask, generateMaskFile, t, addImageToHistory]);

  const handleApplyBackgroundChange = useCallback(async (backgroundPrompt: string) => {
    if (!currentImage) return;
    
    isCancelledRef.current = false;
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateBackgroundAlteredImage(currentImage, backgroundPrompt);
        if (isCancelledRef.current) return;
        
        const watermarkedImageUrl = await addWatermark(adjustedImageUrl);
        addImageToHistory(watermarkedImageUrl);
    } catch (err) {
        if (isCancelledRef.current) return;
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorBackgroundChangeFailed')} ${errorMessage}`);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, t, addImageToHistory]);

  const handleMagicGenerate = useCallback(async () => {
    if (!prompt.trim()) {
        setError(t('errorEnterDescription'));
        return;
    }
    isCancelledRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
        let finalImageUrl: string;
        if (currentImage && secondImage) {
            finalImageUrl = await composeImages(currentImage, secondImage, prompt);
        } else if (currentImage) {
            finalImageUrl = await generateMagicEdit(currentImage, prompt);
        } else {
            const imageUrl = await generateImageFromText(prompt);
            const watermarkedImageUrl = await addWatermark(imageUrl);
            setHistory([watermarkedImageUrl]);
            setHistoryIndex(0);
            clearMask();
            resetView();
            setIsLoading(false);
            return;
        }

        if (isCancelledRef.current) return;
        const watermarkedImageUrl = await addWatermark(finalImageUrl);
        addImageToHistory(watermarkedImageUrl);

    } catch (err) {
        if (isCancelledRef.current) return;
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorGenerateFailed')} ${errorMessage}`);
    } finally {
        setIsLoading(false);
    }
}, [currentImage, secondImage, prompt, addImageToHistory, t, clearMask, resetView]);

const handleGenerateLogo = useCallback(async (logoPrompt: string) => {
    isCancelledRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
        const newLogoUrl = await generateLogo(logoPrompt, logoInProgress, logoBackgroundImage);
        if (isCancelledRef.current) return;

        const watermarkedLogoUrl = await addWatermark(newLogoUrl);
        setLogoInProgress(watermarkedLogoUrl);
    } catch (err) {
        if (isCancelledRef.current) return;
        const errorMessage = err instanceof Error ? err.message : t('errorUnknown');
        setError(`${t('errorGenerateLogoFailed')} ${errorMessage}`);
    } finally {
        setIsLoading(false);
    }
}, [t, logoInProgress, logoBackgroundImage]);

const handleResetLogo = useCallback(() => {
    setLogoInProgress(null);
    setLogoBackgroundImage(null);
}, []);


  // --- MASK DRAWING HANDLERS ---
  const getCoords = useCallback((e: React.PointerEvent<HTMLDivElement>): { x: number, y: number } | null => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = e.clientX;
    const clientY = e.clientY;

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const { scale, x, y } = viewTransform;
    return {
        x: (screenX - x) / scale,
        y: (screenY - y) / scale,
    };
  }, [viewTransform]);

  const clearBrushPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const drawBrushPreview = useCallback((coords: {x: number, y: number}) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, brushSize / 2, 0, 2 * Math.PI);
    ctx.fillStyle = activeTool === 'brush' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 0, 0, 0.5)';
    ctx.fill();
  }, [brushSize, activeTool]);

  const draw = useCallback((start: { x: number; y: number }, end: { x: number; y: number }) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const computedStyle = getComputedStyle(document.documentElement);
    const primaryColor = computedStyle.getPropertyValue('--color-primary-500').trim();

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = activeTool === 'brush' ? primaryColor : 'black';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = activeTool === 'brush' ? 'source-over' : 'destination-out';
    ctx.stroke();
  }, [brushSize, activeTool]);
  
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { clientX, clientY, pointerId } = e;
    pointers.current.set(pointerId, { x: clientX, y: clientY });
    
    if (pointers.current.size === 1 && isDrawingTabActive) {
        setIsDrawing(true);
        const coords = getCoords(e);
        if (coords) {
            lastPosition.current = coords;
            draw(coords, {x: coords.x, y: coords.y + 0.1});
            setHasMask(true);
        }
    } else if (pointers.current.size === 1) { 
        panStartCoords.current = { x: clientX - lastPan.current.x, y: clientY - lastPan.current.y };
    } else if (pointers.current.size === 2) { 
        const pts = Array.from(pointers.current.values()) as {x: number, y: number}[];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinchStartDist.current = dist;
        lastScale.current = viewTransform.scale;
    }

  }, [isDrawingTabActive, getCoords, draw, viewTransform.scale]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (isDrawing && isDrawingTabActive && pointers.current.size === 1) {
        const newPosition = getCoords(e);
        if (lastPosition.current && newPosition) {
            draw(lastPosition.current, newPosition);
            lastPosition.current = newPosition;
        }
    } else if (!isDrawing && isDrawingTabActive) {
        const coords = getCoords(e);
        if(coords) drawBrushPreview(coords);
    } else if (pointers.current.size === 1 && !isDrawingTabActive) { 
        e.preventDefault();
        const currentX = e.clientX - panStartCoords.current.x;
        const currentY = e.clientY - panStartCoords.current.y;
        lastPan.current = { x: currentX, y: currentY };
        setViewTransform(v => ({ ...v, x: currentX, y: currentY }));
    } else if (pointers.current.size === 2) { 
        const pts = Array.from(pointers.current.values()) as {x: number, y: number}[];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const scale = Math.max(0.1, lastScale.current * (dist / pinchStartDist.current));
        setViewTransform(v => ({ ...v, scale }));
    }

  }, [isDrawing, isDrawingTabActive, getCoords, draw, drawBrushPreview]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      
      if (isDrawingTabActive) {
          setIsDrawing(false);
          lastPosition.current = null;
      }
      
      if (pointers.current.size < 2) {
        pinchStartDist.current = 0;
        lastScale.current = viewTransform.scale;
      }

      if (pointers.current.size === 1) {
          const remainingPointer = Array.from(pointers.current.values())[0] as { x: number; y: number };
          panStartCoords.current = { 
              x: remainingPointer.x - lastPan.current.x, 
              y: remainingPointer.y - lastPan.current.y 
          };
      }

      if (pointers.current.size < 1) {
        panStartCoords.current = {x: 0, y: 0};
        const { x, y } = viewTransform;
        lastPan.current = { x, y };
      }

  }, [isDrawingTabActive, viewTransform]);

  const handlePointerLeave = useCallback(() => {
    clearBrushPreview();
  }, [clearBrushPreview]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const newScale = viewTransform.scale - e.deltaY * 0.001;
    setViewTransform(v => ({ ...v, scale: Math.max(0.1, newScale) }));
  }, [viewTransform.scale]);

  const handleUndo = useCallback(() => {
    if (canUndo) setHistoryIndex(historyIndex - 1);
  }, [canUndo, historyIndex]);

  const handleRedo = useCallback(() => {
    if (canRedo) setHistoryIndex(historyIndex + 1);
  }, [canRedo, historyIndex]);

  const handleReset = useCallback(() => {
    setHistory(history.slice(0, 1));
    setHistoryIndex(0);
    clearMask();
  }, [history, clearMask]);

  const handleDownload = useCallback(() => {
    const imageToDownload = activeTab === 'logoMaker' ? logoInProgress : currentImage;
    if (imageToDownload) {
        const a = document.createElement('a');
        a.href = imageToDownload;
        a.download = `PixAI-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
  }, [currentImage, activeTab, logoInProgress]);

  const handleSave = useCallback(async () => {
    const imageToSave = activeTab === 'logoMaker' ? logoInProgress : currentImage;
    if (!imageToSave) return;
    
    if (!user || user.isAnonymous) {
        setError("You must be logged in to save to the cloud.");
        setShowAuthScreen(true);
        return;
    }
    
    setIsSaving(true);
    setError(null);
    try {
        const imageFile = await dataURLtoFile(imageToSave, `gallery-${Date.now()}.png`);
        await saveImageToGallery(imageFile);
        alert('Image saved to your cloud!');
    } catch (err) {
        console.error("Error saving image to cloud:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to save image to cloud.";
        setError(errorMessage);
    } finally {
        setIsSaving(false);
    }
  }, [currentImage, user, activeTab, logoInProgress]);

  const handleNewUpload = () => {
    setHistory([]);
    setHistoryIndex(-1);
    setPage('main');
    setActiveTab('retouch');
    setLogoInProgress(null);
    setLogoBackgroundImage(null);
  };

  const handleTabClick = (tabId: Tab) => {
    if (tabId !== activeTab) {
        clearMask();
        setPrompt('');
        setSecondImage(null);
        setLogoBackgroundImage(null);
        setError(null);
    }
    setActiveTab(tabId);
  };
  
  const handleAcceptWelcome = useCallback(() => {
    localStorage.setItem('welcomeScreenAccepted', 'true');
    setShowWelcomeScreen(false);
  }, []);

  if (isAppLoading) {
    return <LoadingScreen isLoaded={isFadingOut} />;
  }

  if (isAdminView) {
    if (isAuthLoading) {
      return (
        <div className="bg-gray-900 min-h-screen w-full flex items-center justify-center">
          <Spinner />
        </div>
      );
    }
    
    if (!user || user.isAnonymous) {
      return (
        <Suspense fallback={<div className="bg-gray-900 min-h-screen w-full flex items-center justify-center"><Spinner /></div>}>
          <div className="bg-gray-900 min-h-screen w-full">
            <AuthScreen onClose={() => {
              const params = new URLSearchParams(window.location.search);
              params.delete('panel');
              const newSearch = params.toString();
              const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
              window.history.replaceState({}, '', newUrl);
              setIsAdminView(false);
            }} />
          </div>
        </Suspense>
      );
    }
    
    return (
      <Suspense fallback={<div className="bg-gray-900 min-h-screen w-full flex items-center justify-center"><Spinner /></div>}>
        <AdminPanelScreen />
      </Suspense>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
    { id: 'retouch', label: t('retouch'), icon: <MagicWandIcon className="w-5 h-5" /> },
    { id: 'background', label: t('background'), icon: <PhotoIcon className="w-5 h-5" /> },
    { id: 'magic', label: t('magic'), icon: <SparkleIcon className="w-5 h-5" /> },
    { id: 'logoMaker', label: t('logoMakerTab'), icon: <SparkleIcon className="w-5 h-5" /> },
  ];
  
  const isPanningEnabled = !isDrawingTabActive;

  const renderEditorContent = () => {
    return (
        <>
            <aside className="w-full md:w-auto flex flex-col gap-4 animate-fade-in-left">
                <div className="relative w-full md:w-auto bg-gray-800/50 border border-gray-700 rounded-lg backdrop-blur-sm">
                    <div
                        ref={toolbarRef}
                        onScroll={checkScroll}
                        className="flex flex-row md:flex-col items-center justify-start md:justify-center gap-2 p-2 overflow-x-auto no-scrollbar"
                    >
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                disabled={isLoading || isEnhancing}
                                className={`flex-shrink-0 flex md:flex-col items-center justify-center text-center gap-1 p-3 rounded-md transition-all duration-200 text-xs font-bold hover:scale-105 active:scale-95 ${activeTab === tab.id ? 'bg-[var(--color-primary-500)] text-white' : 'text-gray-300 hover:bg-white/10'}`}
                                aria-label={tab.label}
                            >
                                {tab.icon}
                                <div className="hidden sm:flex items-center">
                                    <span>{tab.label}</span>
                                    {tab.id === 'magic' && <span className="ml-1.5 text-xs font-mono bg-fuchsia-500/30 text-fuchsia-300 px-1.5 py-0.5 rounded-full tracking-wider">BETA</span>}
                                </div>
                                 <span className="inline sm:hidden">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    {showScrollFade && (
                        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-800 to-transparent pointer-events-none md:hidden" />
                    )}
                </div>
            </aside>

            {activeTab === 'logoMaker' ? (
                logoInProgress ? (
                    <div className="flex-grow flex items-center justify-center relative overflow-hidden animate-scale-in" ref={imageContainerRef}>
                        <div 
                            className="relative touch-none"
                            style={{ cursor: isMobile ? 'default' : 'grab' }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                        >
                            <div style={{ transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`, transformOrigin: 'center center' }}>
                                <img
                                    ref={imgRef}
                                    src={logoInProgress}
                                    alt="Generated Logo"
                                    className="max-w-full max-h-[55vh] md:max-h-[80vh] object-contain rounded-lg shadow-2xl"
                                    draggable="false"
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-grow flex items-center justify-center relative overflow-hidden animate-scale-in p-8">
                        <div className="text-center text-gray-500 bg-gray-800/30 border border-dashed border-gray-600 rounded-2xl p-12 max-w-lg">
                            <SparkleIcon className="w-16 h-16 mx-auto text-[var(--color-primary-500)]/50 mb-4" />
                            <h3 className="text-xl font-bold text-gray-400">{t('logoMakerTitle')}</h3>
                            <p className="mt-2 text-gray-400">{t('logoMakerPlaceholderView')}</p>
                        </div>
                    </div>
                )
            ) : (
                <div className="flex-grow flex items-center justify-center relative overflow-hidden animate-scale-in" ref={imageContainerRef} onWheel={handleWheel}>
                    <div 
                        className={`relative touch-none ${isPanningEnabled ? 'cursor-grab' : (isMobile ? '' : 'cursor-none')}`}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    >
                        <div style={{ transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`, transformOrigin: 'center center' }}>
                            <>
                                <img
                                    ref={imgRef}
                                    src={isComparing && originalImage ? originalImage : currentImage!}
                                    alt="Editable"
                                    className="max-w-full max-h-[55vh] md:max-h-[80vh] object-contain rounded-lg shadow-2xl"
                                    draggable="false"
                                />
                                {isDrawingTabActive && (
                                    <>
                                      <canvas
                                          ref={maskCanvasRef}
                                          className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40"
                                      />
                                      <canvas
                                          ref={previewCanvasRef}
                                          className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                      />
                                    </>
                                )}
                            </>
                        </div>
                    </div>
                    {currentImage && (
                      <button
                          onPointerDown={() => setIsComparing(true)}
                          onPointerUp={() => setIsComparing(false)}
                          onPointerLeave={() => setIsComparing(false)}
                          disabled={isLoading}
                          className="absolute bottom-4 right-4 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white rounded-full hover:bg-black/70 transition-colors disabled:opacity-50 touch-none"
                          aria-label={t('compareAria')}
                      >
                          <EyeIcon className="w-5 h-5" />
                          <span className="hidden sm:inline">{t('compare')}</span>
                      </button>
                    )}
                </div>
            )}

            <aside className="w-full md:max-w-sm flex flex-col gap-4 animate-fade-in-right">
                {error && (
                    <div className="bg-red-500/20 border border-red-500/20 text-red-300 p-4 rounded-lg animate-fade-in">
                        <h4 className="font-bold">{t('errorOccurred')}</h4>
                        <p className="text-sm">{error}</p>
                    </div>
                )}
                
                <Suspense fallback={<div className="w-full h-48 flex items-center justify-center bg-gray-800/50 border border-gray-700 rounded-lg"><Spinner /></div>}>
                    {activeTab === 'retouch' && (
                        <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
                           <div className={`text-center text-sm rounded-lg p-3 transition-colors ${hasMask ? 'bg-green-500/20 text-green-300' : 'bg-gray-700/80 text-gray-400'}`}>
                               <p>{hasMask ? t('promptDescribeEdit') : t('promptPaintMask')}</p>
                           </div>
                           <div className="relative w-full">
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder={hasMask ? t('placeholderRetouch') : t('placeholderPaintFirst')}
                                    className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
                                    disabled={isLoading || !hasMask || isEnhancing}
                                    rows={3}
                                />
                                <button
                                    onClick={async () => {
                                        const newPrompt = await handleEnhancePrompt(prompt, currentImage);
                                        setPrompt(newPrompt);
                                    }}
                                    disabled={isLoading || isEnhancing || !prompt.trim() || !hasMask}
                                    className="absolute bottom-3 right-3 p-2 rounded-full bg-[var(--color-primary-600)]/80 text-white hover:bg-[var(--color-primary-500)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-primary-800)]"
                                    title={t('enhancePrompt')}
                                >
                                    <SparkleIcon className="w-5 h-5" />
                                </button>
                           </div>
                           <button
                               onClick={handleGenerate}
                               className="w-full bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)] text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-[var(--shadow-primary-light)] hover:shadow-xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-[var(--color-primary-800)] disabled:to-[var(--color-primary-700)] disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                               disabled={isLoading || isEnhancing || !prompt.trim() || !hasMask}
                           >
                               {t('generate')}
                           </button>
                        </div>
                    )}
                    {activeTab === 'magic' && (
                        <MagicPanel
                          prompt={prompt}
                          onPromptChange={setPrompt}
                          onGenerate={handleMagicGenerate}
                          isLoading={isLoading}
                          hasImage={!!currentImage}
                          secondImage={secondImage}
                          onSecondImageChange={setSecondImage}
                          currentImage={currentImage}
                          isEnhancing={isEnhancing}
                          onEnhance={handleEnhancePrompt}
                        />
                    )}
                    {activeTab === 'logoMaker' && 
                        <LogoMakerPanel 
                            onGenerate={handleGenerateLogo} 
                            onReset={handleResetLogo} 
                            isLoading={isLoading} 
                            backgroundImage={logoBackgroundImage}
                            onBackgroundImageChange={setLogoBackgroundImage}
                            contextImage={logoInProgress || logoBackgroundImage}
                            isEnhancing={isEnhancing}
                            onEnhance={handleEnhancePrompt}
                        />
                    }
                    {activeTab === 'background' && <BackgroundPanel onApplyBackgroundChange={handleApplyBackgroundChange} isLoading={isLoading} currentImage={currentImage} isEnhancing={isEnhancing} onEnhance={handleEnhancePrompt}/>}
                </Suspense>

                {isDrawingTabActive && (
                    <>
                        <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4 animate-fade-in backdrop-blur-sm">
                            <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setActiveTool('brush')}
                                  disabled={isLoading || isEnhancing}
                                  className={`p-3 rounded-md transition-colors duration-200 ${activeTool === 'brush' ? 'bg-[var(--color-primary-500)] text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                                  aria-label="Select Brush Tool"
                                >
                                  <BrushIcon className="w-6 h-6" />
                                </button>
                                <button
                                  onClick={() => setActiveTool('eraser')}
                                  disabled={isLoading || isEnhancing}
                                  className={`p-3 rounded-md transition-colors duration-200 ${activeTool === 'eraser' ? 'bg-[var(--color-primary-500)] text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                                  aria-label="Select Eraser Tool"
                                >
                                  <EraserIcon className="w-6 h-6" />
                                </button>
                            </div>
                            <button
                                onClick={clearMask}
                                disabled={isLoading || isEnhancing}
                                className="w-auto text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-2 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 active:scale-95 text-base disabled:opacity-50"
                              >
                                {t('clearMask')}
                            </button>
                        </div>
                        <MaskingToolbar 
                            brushSize={brushSize}
                            onBrushSizeChange={setBrushSize}
                            isLoading={isLoading || isEnhancing}
                        />
                    </>
                )}
            </aside>
        </>
    );
  }

  const renderAppBody = () => {
      if (page === 'about') return <AboutScreen />;
      if (page === 'gallery') return <GalleryScreenLazy onClose={() => setPage('main')} userId={user?.uid} />;
      if (page === 'settings') return <ProfileSettingsScreen onClose={() => setPage('main')} />;

      if (!currentImage) {
          return (
            <>
              <StartScreen onFileSelect={(files) => files && handleImageUpload(files[0])} />
              {showWelcomeScreen && <BetaDisclaimer onAccept={handleAcceptWelcome} />}
            </>
          );
      }
      
      return renderEditorContent();
  }
  
  return (
    <div className="min-h-screen flex flex-col bg-gray-900/50">
        <Header 
            onHomeClick={handleNewUpload} 
            onAboutClick={() => setPage('about')}
            onGalleryClick={() => setPage('gallery')}
            onSettingsClick={() => setPage('settings')}
            onLoginClick={() => setShowAuthScreen(true)}
            isEditing={!!currentImage}
        />

        <main className={`flex-grow flex relative ${currentImage ? 'flex-col md:flex-row p-4 gap-4' : 'items-center justify-center p-4'}`}>
            <Suspense fallback={<Spinner />}>
                {renderAppBody()}
            </Suspense>

            {(isLoading || isEnhancing) && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-40 animate-fade-in backdrop-blur-sm text-center p-4">
                    <Spinner />
                    <p className="text-lg font-semibold mt-4 text-gray-200">{isEnhancing ? 'Enhancing prompt...' : t('aiWorking')}</p>
                    {isLoading && (
                        <button
                          onClick={handleCancelGeneration}
                          className="mt-6 bg-white/10 px-4 py-2 text-sm font-semibold text-gray-200 rounded-md hover:bg-white/20 transition-colors"
                        >
                          Cancel
                        </button>
                    )}
                </div>
            )}
        </main>

        <footer className="w-full py-3 px-4 sm:px-8 border-t border-gray-700 bg-gray-800/30 backdrop-blur-sm">
            {(currentImage || logoInProgress) && page === 'main' ? (
                <div className="flex flex-col items-center gap-3">
                    <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            {activeTab !== 'logoMaker' && (
                                <>
                                    <button onClick={handleUndo} disabled={!canUndo || isLoading || isEnhancing} className="flex items-center gap-2 bg-white/10 px-3 py-2 text-xs sm:text-sm font-semibold text-gray-200 rounded-md hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{t('undo')}<UndoIcon className="w-5 h-5"/></button>
                                    <button onClick={handleRedo} disabled={!canRedo || isLoading || isEnhancing} className="flex items-center gap-2 bg-white/10 px-3 py-2 text-xs sm:text-sm font-semibold text-gray-200 rounded-md hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{t('redo')}<RedoIcon className="w-5 h-5"/></button>
                                    <button onClick={handleReset} disabled={!canUndo || isLoading || isEnhancing} className="bg-white/10 px-3 py-2 text-xs sm:text-sm font-semibold text-gray-200 rounded-md hover:bg-white/20 transition-colors disabled:opacity-50">{t('reset')}</button>
                                </>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button onClick={handleNewUpload} className="bg-white/10 px-3 py-2 text-xs sm:text-sm font-semibold text-gray-200 rounded-md hover:bg-white/20 transition-colors">{t('startOver')}</button>
                            <button
                                onClick={handleSave}
                                disabled={isLoading || isSaving || !user || user.isAnonymous || isEnhancing}
                                className="flex items-center gap-2 bg-green-600 px-3 py-2 text-xs sm:text-sm font-bold text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-green-800"
                                title={!user || user.isAnonymous ? "Please log in to save images" : "Save to your personal cloud storage"}
                            >
                                <CloudArrowUpIcon className="w-5 h-5" />
                                {isSaving ? 'Saving...' : 'Save to Cloud'}
                            </button>
                            <button onClick={handleDownload} className="bg-[var(--color-primary-500)] px-3 py-2 text-xs sm:text-sm font-bold text-white rounded-md hover:bg-[var(--color-primary-600)] transition-colors">{t('downloadImage')}</button>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 pt-2">2025 all reserved from G.B</p>
                </div>
            ) : (
                <p className="text-center text-xs text-gray-500">2025 all reserved from G.B</p>
            )}
        </footer>
        
        <Assistant />

        <Suspense fallback={<div className="fixed inset-0 bg-black/60 flex items-center justify-center"><Spinner /></div>}>
            {showAuthScreen && <AuthScreen onClose={() => setShowAuthScreen(false)} />}
        </Suspense>
    </div>
  );
};

export default App;
