/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Analytics } from './AiPanelScreen';
import { deleteGeneratedImage } from '../services/geminiService';
import { TrashIcon, ChevronDownIcon, DevicePhoneMobileIcon, GlobeAltIcon } from './icons';

const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    if (seconds < 2) return '1s ago';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
};

interface AdminImageFeedPanelProps {
  analytics: Analytics;
}

const AdminImageFeedPanel: React.FC<AdminImageFeedPanelProps> = ({ analytics }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [imageActions, setImageActions] = useState<any[]>([]); 
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
    const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const headerCheckboxRef = useRef<HTMLInputElement>(null);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        const sortedActions = analytics.allActions
            .filter(a => a.feature === 'generation' && a.details?.imageUrl)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setImageActions(sortedActions);
    }, [analytics.allActions]);

    const filteredActions = useMemo(() => {
        if (!searchTerm.trim()) {
            return imageActions;
        }
        return imageActions.filter(action =>
            action.details?.prompt?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [imageActions, searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedActionIds(new Set());
    }, [searchTerm]);

    const totalPages = Math.ceil(filteredActions.length / ITEMS_PER_PAGE);
    const paginatedActions = filteredActions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => {
        if (headerCheckboxRef.current) {
            const idsOnPage = paginatedActions.map(a => a.id);
            if (idsOnPage.length === 0) {
                headerCheckboxRef.current.checked = false;
                headerCheckboxRef.current.indeterminate = false;
                return;
            }
            const selectedOnPageCount = idsOnPage.filter(id => selectedActionIds.has(id)).length;
            headerCheckboxRef.current.checked = selectedOnPageCount === idsOnPage.length;
            headerCheckboxRef.current.indeterminate = selectedOnPageCount > 0 && selectedOnPageCount < idsOnPage.length;
        }
    }, [selectedActionIds, paginatedActions]);

    const handleToggleSelect = (actionId: string) => {
        setSelectedActionIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(actionId)) {
                newSet.delete(actionId);
            } else {
                newSet.add(actionId);
            }
            return newSet;
        });
    };

    const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const idsOnPage = new Set(paginatedActions.map(a => a.id));
        setSelectedActionIds(prev => {
            const newSet = new Set(prev);
            if (e.target.checked) {
                idsOnPage.forEach(id => newSet.add(id));
            } else {
                idsOnPage.forEach(id => newSet.delete(id));
            }
            return newSet;
        });
    };

    const handleDelete = async (actionToDelete: any) => {
        if (window.confirm('Are you sure you want to permanently delete this image from storage and remove it from the log? This cannot be undone.')) {
            setIsDeleting(true);
            try {
                setError(null);
                await deleteGeneratedImage(actionToDelete);
                setSelectedActionIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(actionToDelete.id);
                    return newSet;
                });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
                console.error("Failed to delete image:", err);
                setError(`Failed to delete image: ${errorMessage}`);
            } finally {
                setIsDeleting(false);
            }
        }
    };
    
    const handleBulkDelete = async () => {
        if (window.confirm(`Are you sure you want to permanently delete ${selectedActionIds.size} selected images? This cannot be undone.`)) {
            setIsDeleting(true);
            setError(null);

            const actionsToDelete = imageActions.filter(action => selectedActionIds.has(action.id));
            const results = await Promise.allSettled(
                actionsToDelete.map(action => deleteGeneratedImage(action))
            );

            const failedDeletions = results.filter(r => r.status === 'rejected');
            if (failedDeletions.length > 0) {
                console.error("Some deletions failed:", failedDeletions);
                setError(`${failedDeletions.length} of ${actionsToDelete.length} images could not be deleted. See console for details.`);
            }

            const successfulIds = new Set(
                actionsToDelete
                    .filter((_, index) => results[index].status === 'fulfilled')
                    .map(action => action.id)
            );

            if(analytics.allActions) {
                 const updatedActions = analytics.allActions.filter(action => !successfulIds.has(action.id));
                 analytics.allActions = updatedActions; 
            }
            setSelectedActionIds(new Set());
            setIsDeleting(false);
        }
    };


    const toggleExpand = (actionId: string) => {
        setExpandedActionId(currentId => (currentId === actionId ? null : actionId));
    };

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col h-full animate-fade-in">
            <div className="p-4 md:p-6 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-gray-200">Generated Image Feed ({filteredActions.length} results)</h2>
                <p className="text-sm text-gray-400 mt-1">A real-time log of all images created by users. Click an item to expand details.</p>
                <div className="mt-4 relative">
                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by prompt..."
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none transition"
                    />
                </div>
                {error && <p className="text-sm text-red-400 mt-2 bg-red-500/10 p-2 rounded-md">{error}</p>}
            </div>

            {selectedActionIds.size > 0 && (
                <div className="p-3 bg-[var(--color-primary-700)]/30 border-b border-[var(--color-primary-500)]/30 flex items-center justify-between animate-fade-in sticky top-0 z-10">
                    <span className="text-sm font-semibold text-white">{selectedActionIds.size} selected</span>
                    <button
                        onClick={handleBulkDelete}
                        disabled={isDeleting}
                        className="flex items-center gap-2 text-xs font-semibold bg-red-600/90 text-white py-2 px-3 rounded-md hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isDeleting ? 'Deleting...' : <><TrashIcon className="w-4 h-4" /> Delete Selected</>}
                    </button>
                </div>
            )}

            {paginatedActions.length > 0 ? (
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="flex items-center gap-3 mb-4 border-b border-gray-700 pb-3">
                        <input
                            ref={headerCheckboxRef}
                            type="checkbox"
                            onChange={handleToggleSelectAll}
                            className="w-5 h-5 rounded text-[var(--color-primary-500)] bg-gray-700 border-gray-600 focus:ring-[var(--color-primary-600)] ring-offset-gray-800"
                            aria-label="Select all images on page"
                        />
                        <label className="text-sm text-gray-300">Select all on page</label>
                    </div>
                    <div className="space-y-3">
                        {paginatedActions.map((action) => {
                            const isSelected = selectedActionIds.has(action.id);
                            const isMobile = action.platform === 'mobile_app';
                            return (
                            <div key={action.id} className={`bg-gray-800 rounded-lg border ${isSelected ? 'border-[var(--color-primary-500)] ring-2 ring-[var(--color-primary-500)]/20' : 'border-gray-700'} overflow-hidden transition-all duration-300 relative`}>
                                <div className="absolute top-3 left-3 z-10">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleToggleSelect(action.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-5 h-5 rounded text-[var(--color-primary-500)] bg-gray-900/50 border-gray-600 focus:ring-[var(--color-primary-600)] ring-offset-gray-800"
                                        aria-label={`Select image from prompt: ${action.details.prompt}`}
                                    />
                                </div>
                                <button onClick={() => toggleExpand(action.id)} className="w-full flex items-center gap-4 p-3 pl-12 text-left hover:bg-white/5 transition-colors">
                                    <img 
                                        src={action.details.imageUrl} 
                                        alt="thumbnail" 
                                        className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-gray-700"
                                        loading="lazy"
                                    />
                                    <div className="flex-1 overflow-hidden">
                                        <div className="flex items-center gap-2">
                                            {isMobile ? 
                                                <span title="Mobile App"><DevicePhoneMobileIcon className="w-4 h-4 text-purple-400 flex-shrink-0" /></span> : 
                                                <span title="Web"><GlobeAltIcon className="w-4 h-4 text-blue-400 flex-shrink-0" /></span>
                                            }
                                            <p className="text-sm font-semibold text-white truncate" title={action.details.prompt || 'No prompt'}>
                                                {action.details.prompt || 'No prompt provided'}
                                            </p>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">
                                            by <span className="font-mono text-gray-300">{action.userId.substring(0, 8)}...</span> - {formatRelativeTime(action.timestamp)}
                                        </p>
                                    </div>
                                    <ChevronDownIcon className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-300 ${expandedActionId === action.id ? 'rotate-180' : ''}`} />
                                </button>
                                
                                {expandedActionId === action.id && (
                                    <div className="p-4 border-t border-gray-700/80 bg-black/20 animate-fade-in">
                                        <a href={action.details.imageUrl} target="_blank" rel="noopener noreferrer">
                                            <img src={action.details.imageUrl} alt={action.details.prompt} className="w-full max-w-sm mx-auto rounded-lg mb-4 border border-gray-600" />
                                        </a>
                                        <div className="space-y-3 text-sm">
                                            <div>
                                                <h4 className="font-semibold text-gray-300">Full Prompt</h4>
                                                <p className="text-gray-400 italic bg-gray-900/50 p-2 rounded-md mt-1 whitespace-pre-wrap">"{action.details.prompt || 'N/A'}"</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                <div>
                                                    <h4 className="font-semibold text-gray-300">Feature</h4>
                                                    <p className="text-gray-400 capitalize">{action.details.originalFeature?.replace(/([A-Z])/g, ' $1') || 'Unknown'}</p>
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-300">Source</h4>
                                                    <p className="text-gray-400 capitalize">{action.platform === 'mobile_app' ? 'Mobile App' : 'Web Browser'}</p>
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-300">Timestamp</h4>
                                                    <p className="text-gray-400">{new Date(action.timestamp).toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-300">User ID</h4>
                                                    <p className="text-gray-400 font-mono">{action.userId}</p>
                                                </div>
                                            </div>
                                            <div className="pt-3 flex justify-end">
                                                <button 
                                                    onClick={() => handleDelete(action)}
                                                    disabled={isDeleting}
                                                    className="flex items-center gap-2 text-xs font-semibold bg-red-600/90 text-white py-2 px-3 rounded-md hover:bg-red-500 transition-colors disabled:opacity-50"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                    Delete Permanently
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )})}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <p>{searchTerm ? 'No images match your search.' : 'No generated images found.'}</p>
                </div>
            )}
            
            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 mt-auto border-t border-gray-700 flex-shrink-0">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="bg-gray-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-gray-400">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="bg-gray-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminImageFeedPanel;