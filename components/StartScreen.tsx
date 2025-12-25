
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { UploadIcon, PhotoIcon, ArrowDownTrayIcon, TrashIcon, DevicePhoneMobileIcon, ShieldCheckIcon, SparkleIcon, ExclamationTriangleIcon } from './icons';
import { useTranslations } from '../useTranslations';
import { getImagesFromGallery, deleteImageFromGallery, SupabaseStoredImage } from '../services/geminiService';
import Spinner from './Spinner';

interface StartScreenProps {
  onFileSelect: (files: FileList | null) => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect }) => {
  const { t } = useTranslations();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileSelect(e.target.files);
  };

  return (
    <div 
      className={`w-full h-full min-h-[85vh] flex flex-col justify-center transition-all duration-300 ${isDraggingOver ? 'bg-[var(--color-primary-500)]/10 scale-105' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        onFileSelect(e.dataTransfer.files);
      }}
    >
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 flex-grow flex flex-col items-center justify-center text-center">
        {/* Main CTA Section */}
        <div className="animate-fade-in my-12 w-full">
            <div className="mb-10 max-w-3xl mx-auto flex items-center justify-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-left backdrop-blur-sm shadow-lg shadow-red-900/20">
                <ExclamationTriangleIcon className="w-8 h-8 text-red-400 flex-shrink-0 animate-pulse" />
                <div>
                    <p className="text-red-200 font-bold text-lg">{t('testModeMessage' as any)}</p>
                </div>
            </div>

            <h1 className="text-5xl font-extrabold tracking-tight text-gray-100 sm:text-6xl md:text-7xl">
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary-400)] to-[var(--color-primary-300)]">
                {t('startTitle')}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-400 md:text-xl">
              {t('startSubtitle')}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <label htmlFor="image-upload-start" className="relative group inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white bg-[var(--color-primary-600)] rounded-lg cursor-pointer transition-all duration-300 overflow-hidden hover:bg-[var(--color-primary-700)] hover:shadow-2xl hover:shadow-[var(--shadow-primary)] hover:-translate-y-1">
                  <span className="absolute h-0 w-0 rounded-full bg-[var(--color-primary-500)] transition-all duration-500 ease-out group-hover:h-56 group-hover:w-56"></span>
                  <span className="relative flex items-center gap-3">
                    <UploadIcon className="w-6 h-6" />
                    {t('uploadImage')}
                  </span>
              </label>
              <input type="file" id="image-upload-start" className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
            <p className="text-center mt-4 text-sm text-gray-500">{t('dragAndDrop')}</p>
            
            {/* Android App Download Section */}
            <div className="mt-12 max-w-xl mx-auto p-6 bg-gray-800/50 border border-gray-700 rounded-2xl backdrop-blur-sm animate-fade-in">
                <div className="flex items-center justify-center gap-3 mb-4 text-green-400">
                     <DevicePhoneMobileIcon className="w-8 h-8" />
                     <h3 className="text-xl font-bold text-gray-100">{t('androidAppTitle' as any)}</h3>
                </div>
                <p className="text-gray-300 mb-6">{t('androidAppDescription' as any)}</p>
                
                <a 
                    href="https://www.mediafire.com/file/8ikap1lsebszso8/PixAI+beta+version+MADE+BY+G.B+.apk/file" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-full transition-all duration-300 shadow-lg hover:shadow-green-500/30 hover:-translate-y-1 mb-6"
                >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    {t('downloadApk' as any)}
                </a>
                
                <div className="flex items-start justify-center gap-2 text-left bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20 max-w-md mx-auto">
                     <ShieldCheckIcon className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                     <p className="text-xs text-yellow-200/80 leading-relaxed">{t('androidAppDisclaimer' as any)}</p>
                </div>
            </div>

            <p className="text-center mt-6 text-sm text-gray-600">Made by ❤️</p>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StartScreen);

// --- GALLERY SCREEN ---

const GalleryImageCard: React.FC<{ image: SupabaseStoredImage; onDelete: (name: string) => void; }> = ({ image, onDelete }) => {
    const { t } = useTranslations();
    const imageUrl = image.url;

    const handleDownload = async () => {
        if (!imageUrl) return;
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
    
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = image.name || `PixAI-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            console.error("Download failed:", error);
            alert("Could not download the image. Please try again.");
        }
    };

    const handleDelete = () => {
        if (window.confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
            onDelete(image.name);
        }
    };

    return (
        <div className="relative group aspect-square overflow-hidden rounded-xl border border-gray-700/50 shadow-lg">
            <img loading="lazy" src={imageUrl} alt={`Saved at ${new Date(image.timestamp).toLocaleString()}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                <div className="flex items-center justify-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                    <button onClick={handleDownload} className="flex items-center gap-2 bg-[var(--color-primary-600)]/90 text-white font-bold py-2 px-4 rounded-full text-sm hover:bg-[var(--color-primary-500)] transition-colors">
                        <ArrowDownTrayIcon className="w-5 h-5" />
                        <span>{t('download')}</span>
                    </button>
                    <button onClick={handleDelete} className="flex items-center gap-2 bg-red-600/90 text-white font-bold py-2 px-4 rounded-full text-sm hover:bg-red-500 transition-colors">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export const GalleryScreen: React.FC<{onClose: () => void; userId?: string}> = ({ onClose, userId }) => {
    const { t } = useTranslations();
    const [images, setImages] = useState<SupabaseStoredImage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchImages = useCallback(async () => {
        if (!userId) {
            setError("You must be logged in to view the gallery.");
            setIsLoading(false);
            return;
        }
        try {
            setIsLoading(true);
            const storedImages = await getImagesFromGallery(userId);
            setImages(storedImages);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load images.';
            setError(errorMessage);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchImages();
    }, [fetchImages]);

    const handleDelete = async (imageName: string) => {
        if (!userId) return;
        try {
            await deleteImageFromGallery(imageName, userId);
            setImages(prev => prev.filter(img => img.name !== imageName));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete image.');
            console.error(err);
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 animate-fade-in">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-extrabold text-gray-100">{t('galleryTitle')}</h1>
                <p className="mt-2 text-md text-gray-400 max-w-3xl mx-auto">{t('galleryDescription')}</p>
            </div>

            {error && <p className="text-center text-red-400 bg-red-500/10 p-3 rounded-lg">{error}</p>}

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Spinner />
                </div>
            ) : images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {images.map((image, index) => (
                        <div key={image.name} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms`, opacity: 0 }}>
                            <GalleryImageCard image={image} onDelete={handleDelete} />
                        </div>
                    ))}
                </div>
            ) : (
                 !userId ? (
                    <div className="text-center py-16 px-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
                        <h3 className="text-2xl font-bold text-gray-200">Please Log In</h3>
                        <p className="text-gray-400 mt-2">Log in to see your saved images.</p>
                    </div>
                ) : (
                    <div className="text-center py-16 px-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
                        <PhotoIcon className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                        <h3 className="text-2xl font-bold text-gray-200">{t('galleryEmpty')}</h3>
                        <p className="text-gray-400 mt-2">{t('galleryEmptySuggestion')}</p>
                    </div>
                )
            )}
        </div>
    );
};
