/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo } from 'react';
import { Analytics, ProcessedUser } from './AiPanelScreen';
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon, DevicePhoneMobileIcon, GlobeAltIcon } from './icons';

interface AdminUsersPanelProps {
  analytics: Analytics;
  onUserSelect: (user: ProcessedUser) => void;
}

type SortableKeys = 'lastSeen' | 'firstSeen' | 'actionCount' | 'name';
type Segment = 'all' | 'active' | 'new' | 'inactive';

const formatRelativeTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
};

const PlatformIcon: React.FC<{ platform?: string }> = ({ platform }) => {
    if (platform === 'mobile_app') {
        return <DevicePhoneMobileIcon className="w-4 h-4 text-purple-400" title="Mobile App" />;
    }
    // Default to web if undefined or web
    return <GlobeAltIcon className="w-4 h-4 text-blue-400" title="Web" />;
};

const UserCard: React.FC<{ user: ProcessedUser, onUserSelect: (user: ProcessedUser) => void }> = ({ user, onUserSelect }) => (
    <div onClick={() => onUserSelect(user)} className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3 cursor-pointer active:bg-gray-700/50 transition-colors">
        <div className="flex justify-between items-start">
            <div className="overflow-hidden pr-2">
                <div className="flex items-center gap-2 mb-1">
                    <PlatformIcon platform={user.lastPlatform} />
                    <p className="font-bold text-white truncate">{user.name}</p>
                </div>
                <p className="text-xs text-gray-400 font-mono truncate">{user.email !== 'N/A' ? user.email : user.id}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-lg font-semibold text-white">{user.actionCount}</p>
                <p className="text-xs text-gray-500">Actions</p>
            </div>
        </div>
        <div className="flex justify-between text-xs text-gray-400 border-t border-gray-700 pt-3">
            <span>Last Seen: {formatRelativeTime(user.lastSeen)}</span>
            <span>First Seen: {new Date(user.firstSeen).toLocaleDateString()}</span>
        </div>
    </div>
);

const AdminUsersPanel: React.FC<AdminUsersPanelProps> = ({ analytics, onUserSelect }) => {
    const { userActivityLog = [] } = analytics;
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'asc' | 'desc' } | null>({ key: 'lastSeen', direction: 'desc' });
    const [activeSegment, setActiveSegment] = useState<Segment>('all');
    const ITEMS_PER_PAGE = 15;

    const filteredUsers = useMemo(() => {
        const now = Date.now();
        const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        
        switch (activeSegment) {
            case 'active':
                return userActivityLog.filter(u => new Date(u.lastSeen).getTime() >= twentyFourHoursAgo);
            case 'new':
                return userActivityLog.filter(u => new Date(u.firstSeen).getTime() >= sevenDaysAgo);
            case 'inactive':
                 return userActivityLog.filter(u => new Date(u.lastSeen).getTime() < sevenDaysAgo);
            case 'all':
            default:
                return userActivityLog;
        }
    }, [userActivityLog, activeSegment]);
    
    const sortedUsers = useMemo(() => {
        let sortableItems = [...filteredUsers];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    if (sortConfig.key === 'lastSeen' || sortConfig.key === 'firstSeen') {
                         if (new Date(aValue).getTime() < new Date(bValue).getTime()) {
                            return sortConfig.direction === 'asc' ? -1 : 1;
                        }
                        if (new Date(aValue).getTime() > new Date(bValue).getTime()) {
                            return sortConfig.direction === 'asc' ? 1 : -1;
                        }
                    } else { // string sort for name
                         return aValue.localeCompare(bValue) * (sortConfig.direction === 'asc' ? 1 : -1);
                    }
                } else { // number sort for actionCount
                    if (aValue < bValue) {
                        return sortConfig.direction === 'asc' ? -1 : 1;
                    }
                    if (aValue > bValue) {
                        return sortConfig.direction === 'asc' ? 1 : -1;
                    }
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredUsers, sortConfig]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
        setCurrentPage(1); // Reset to first page on sort
    };
    
    const handleSegmentChange = (segment: Segment) => {
        setActiveSegment(segment);
        setCurrentPage(1); // Reset to first page on segment change
    };

    const totalPages = Math.ceil(sortedUsers.length / ITEMS_PER_PAGE);
    const paginatedUsers = sortedUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
    
    const segments: {id: Segment, label: string}[] = [
        {id: 'all', label: 'All'},
        {id: 'active', label: 'Active (24h)'},
        {id: 'new', label: 'New (7d)'},
        {id: 'inactive', label: 'Inactive'},
    ];

    return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col h-full animate-fade-in">
            <div className="p-4 md:p-6 flex-col sm:flex-row flex justify-between items-start sm:items-center gap-4">
                 <h2 className="text-lg font-semibold text-gray-200">Users ({sortedUsers.length})</h2>
                 <div className="bg-gray-900/50 border border-gray-700 p-1 rounded-lg flex items-center gap-1">
                    {segments.map(segment => (
                        <button 
                            key={segment.id}
                            onClick={() => handleSegmentChange(segment.id)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeSegment === segment.id ? 'bg-[var(--color-primary-500)] text-white' : 'text-gray-300 hover:bg-white/10'}`}
                        >
                            {segment.label}
                        </button>
                    ))}
                 </div>
            </div>

            {/* Desktop Table View */}
            <div className="overflow-x-auto flex-1 hidden md:block">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0">
                        <tr>
                            <SortableHeader sortKey="name">User</SortableHeader>
                            <SortableHeader sortKey="lastSeen">Last Seen</SortableHeader>
                            <SortableHeader sortKey="firstSeen">First Seen</SortableHeader>
                            <SortableHeader sortKey="actionCount">Actions</SortableHeader>
                        </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-700/50'>
                        {paginatedUsers.map(user => (
                            <tr key={user.id} className="hover:bg-gray-700/50 cursor-pointer" onClick={() => onUserSelect(user)}>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <PlatformIcon platform={user.lastPlatform} />
                                        <div>
                                            <div className="font-medium text-white">{user.name}</div>
                                            <div className="text-xs text-gray-500 font-mono" title={user.id}>
                                                {user.email !== 'N/A' ? user.email : user.id}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap" title={new Date(user.lastSeen).toLocaleString()}>{formatRelativeTime(user.lastSeen)}</td>
                                <td className="px-4 py-3 whitespace-nowrap" title={new Date(user.firstSeen).toLocaleString()}>{new Date(user.firstSeen).toLocaleDateString()}</td>
                                <td className="px-4 py-3 text-white font-semibold">{user.actionCount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden flex-1 overflow-y-auto p-4 space-y-3">
                {paginatedUsers.map(user => (
                    <UserCard key={user.id} user={user} onUserSelect={onUserSelect} />
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 mt-auto border-t border-gray-700">
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

export default AdminUsersPanel;