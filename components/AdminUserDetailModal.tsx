/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { ProcessedUser } from './AiPanelScreen';
import { XMarkIcon, ClockIcon, CalendarDaysIcon, ChartBarIcon } from './icons';

interface AdminUserDetailModalProps {
    user: ProcessedUser;
    allActions: any[];
    onClose: () => void;
}

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

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; title?: string }> = ({ icon, label, value, title }) => (
    <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-700/60 flex items-center justify-center flex-shrink-0">{icon}</div>
        <div>
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-white" title={title}>{value}</p>
        </div>
    </div>
);

const AdminUserDetailModal: React.FC<AdminUserDetailModalProps> = ({ user, allActions, onClose }) => {
    const userActions = allActions.filter(action => action.userId === user.id);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div 
                className="bg-gray-800 border border-gray-700 w-full max-w-3xl h-full max-h-[80vh] rounded-2xl flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white">{user.name}</h2>
                        <p className="text-xs font-mono text-gray-500">{user.email !== 'N/A' ? user.email : user.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-gray-900/40 flex-shrink-0 border-b border-gray-700">
                    <Stat icon={<ClockIcon className="w-4 h-4 text-gray-300" />} label="Last Seen" value={formatRelativeTime(user.lastSeen)} title={new Date(user.lastSeen).toLocaleString()} />
                    <Stat icon={<CalendarDaysIcon className="w-4 h-4 text-gray-300" />} label="First Seen" value={new Date(user.firstSeen).toLocaleDateString()} title={new Date(user.firstSeen).toLocaleString()} />
                    <Stat icon={<ChartBarIcon className="w-4 h-4 text-gray-300" />} label="Total Actions" value={user.actionCount.toString()} />
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <h3 className="font-semibold text-gray-300 mb-2">Action History</h3>
                    {userActions.length > 0 ? (
                        <div className="overflow-x-auto">
                             <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0">
                                    <tr>
                                        <th scope="col" className="px-3 py-2">Time</th>
                                        <th scope="col" className="px-3 py-2">Feature</th>
                                        <th scope="col" className="px-3 py-2">Prompt / Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {userActions.map((action, index) => (
                                        <tr key={index}>
                                            <td className="px-3 py-2 whitespace-nowrap" title={new Date(action.timestamp).toLocaleString()}>{formatRelativeTime(action.timestamp)}</td>
                                            <td className="px-3 py-2 font-medium text-white capitalize">{action.feature.replace(/([A-Z])/g, ' $1')}</td>
                                            <td className="px-3 py-2 text-xs italic text-gray-300 font-mono truncate max-w-xs" title={action.details?.prompt}>{action.details?.prompt ? `"${action.details.prompt}"` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                         <p className="text-center text-gray-500 py-8">No actions recorded for this user.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminUserDetailModal;