/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo } from 'react';
import { Analytics, ActionWithUser } from './AiPanelScreen';
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon, DevicePhoneMobileIcon, GlobeAltIcon } from './icons';

interface AdminActionLogProps {
  analytics: Analytics;
  onActionSelect: (action: ActionWithUser) => void;
}

type SortableKeys = 'timestamp' | 'feature' | 'userId';

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

const PlatformIcon: React.FC<{ platform?: string }> = ({ platform }) => {
    if (platform === 'mobile_app') {
        return <DevicePhoneMobileIcon className="w-4 h-4 text-purple-400" />;
    }
    return <GlobeAltIcon className="w-4 h-4 text-blue-400" />;
};

const ActionCard: React.FC<{ action: ActionWithUser; onActionSelect: (action: ActionWithUser) => void; }> = ({ action, onActionSelect }) => (
    <div onClick={() => onActionSelect(action)} className="bg-gray-800 p-3 rounded-lg border border-gray-700 space-y-2 cursor-pointer hover:bg-gray-700/50 transition-colors">
        <div className="flex justify-between items-start">
            <div>
                <div className="flex items-center gap-2">
                    <PlatformIcon platform={action.platform} />
                    <p className="font-bold text-white capitalize">{action.feature.replace(/([A-Z])/g, ' $1')}</p>
                </div>
                <p className="text-xs text-gray-400 font-mono" title={action.userId}>User: {action.userName}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400 whitespace-nowrap" title={new Date(action.timestamp).toLocaleString()}>{formatRelativeTime(action.timestamp)}</p>
                {action.details?.duration && <p className="text-xs font-mono text-cyan-300">{action.details.duration.toFixed(2)}s</p>}
            </div>
        </div>
        {action.details?.prompt && (
             <p className="text-xs italic text-gray-300 bg-black/20 p-2 rounded-md truncate">"{action.details.prompt}"</p>
        )}
    </div>
);

const AdminActionLog: React.FC<AdminActionLogProps> = ({ analytics, onActionSelect }) => {
    const { allActions = [] } = analytics;
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'asc' | 'desc' } | null>({ key: 'timestamp', direction: 'desc' });
    const ITEMS_PER_PAGE = 20;

    const sortedActions = useMemo(() => {
        let sortableItems = [...allActions] as ActionWithUser[];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [allActions, sortConfig]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const totalPages = Math.ceil(sortedActions.length / ITEMS_PER_PAGE);
    const paginatedActions = sortedActions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const SortableHeader: React.FC<{ sortKey: SortableKeys, children: React.ReactNode }> = ({ sortKey, children }) => {
        const isSorted = sortConfig?.key === sortKey;
        return (
            <th scope="col" className="px-4 py-3">
                <button className="flex items-center gap-1 group" onClick={() => requestSort(sortKey)}>
                    {children}
                    <span className="text-gray-500">
                        {isSorted ? (
                            sortConfig?.direction === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                            <ChevronUpDownIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                    </span>
                </button>
            </th>
        );
    };

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col h-full animate-fade-in">
             <div className="p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-200">Real-Time Action Log ({allActions.length} total)</h2>
            </div>
            {/* Desktop Table View */}
            <div className="overflow-x-auto flex-1 hidden md:block">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th scope="col" className="px-4 py-3">Source</th>
                            <SortableHeader sortKey="timestamp">Time</SortableHeader>
                            <SortableHeader sortKey="userId">User</SortableHeader>
                            <SortableHeader sortKey="feature">Feature</SortableHeader>
                            <th scope="col" className="px-4 py-3">Details</th>
                            <th scope="col" className="px-4 py-3">Duration</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {paginatedActions.map((action, index) => (
                            <tr key={action.id || index} className="hover:bg-gray-700/50 cursor-pointer" onClick={() => onActionSelect(action)}>
                                <td className="px-4 py-2">
                                    <div title={action.platform === 'mobile_app' ? 'Mobile App / APK' : 'Web Browser'}>
                                        <PlatformIcon platform={action.platform} />
                                    </div>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap" title={new Date(action.timestamp).toLocaleString()}>{formatRelativeTime(action.timestamp)}</td>
                                <td className="px-4 py-2 font-mono text-xs text-gray-300" title={action.userId}>{action.userName}</td>
                                <td className="px-4 py-2 font-medium text-white capitalize">{action.feature.replace(/([A-Z])/g, ' $1')}</td>
                                <td className="px-4 py-2 text-xs italic text-gray-300 truncate max-w-xs" title={action.details?.prompt}>{action.details?.prompt ? `"${action.details.prompt}"` : '-'}</td>
                                <td className="px-4 py-2 font-mono text-xs text-cyan-300">{action.details?.duration ? `${action.details.duration.toFixed(2)}s` : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Mobile Card View */}
            <div className="block md:hidden flex-1 overflow-y-auto p-4 space-y-3">
                {paginatedActions.map((action, index) => (
                    <ActionCard key={action.id || index} action={action} onActionSelect={onActionSelect} />
                ))}
            </div>

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

export default AdminActionLog;
