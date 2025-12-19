/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { ActionWithUser } from './AiPanelScreen';
import { XMarkIcon, ClockIcon, SparkleIcon, UserCircleIcon, ClipboardDocumentListIcon } from './icons';

interface AdminActionDetailModalProps {
    action: ActionWithUser;
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

const DetailItem: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode; }> = ({ icon, label, children }) => (
    <div>
        <div className="flex items-center gap-2 mb-1">
            {icon}
            <h4 className="font-semibold text-gray-300 text-sm">{label}</h4>
        </div>
        <div className="pl-6">{children}</div>
    </div>
);

const AdminActionDetailModal: React.FC<AdminActionDetailModalProps> = ({ action, onClose }) => {

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div 
                className="bg-gray-800 border border-gray-700 w-full max-w-2xl h-full max-h-[90vh] rounded-2xl flex flex-col shadow-2xl animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white capitalize">{action.feature.replace(/([A-Z])/g, ' $1')}</h2>
                        <p className="text-xs text-gray-400">Action performed by {action.userName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {action.details?.imageUrl && (
                        <div className="text-center">
                             <a href={action.details.imageUrl} target="_blank" rel="noopener noreferrer">
                                <img 
                                    src={action.details.imageUrl} 
                                    alt={action.details.prompt || 'Generated Image'} 
                                    className="max-w-full max-h-80 mx-auto rounded-lg border border-gray-600" 
                                />
                             </a>
                        </div>
                    )}

                    <DetailItem icon={<ClipboardDocumentListIcon className="w-4 h-4 text-gray-400" />} label="Prompt">
                         <p className="text-gray-300 text-sm italic bg-gray-900/50 p-3 rounded-md whitespace-pre-wrap">"{action.details?.prompt || 'No prompt provided'}"</p>
                    </DetailItem>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <DetailItem icon={<UserCircleIcon className="w-4 h-4 text-gray-400" />} label="User">
                            <p className="text-gray-300 text-sm font-semibold">{action.userName}</p>
                            <p className="text-xs text-gray-500 font-mono">{action.userId}</p>
                        </DetailItem>
                        <DetailItem icon={<ClockIcon className="w-4 h-4 text-gray-400" />} label="Timestamp">
                             <p className="text-gray-300 text-sm">{new Date(action.timestamp).toLocaleString()}</p>
                             <p className="text-xs text-gray-500">{formatRelativeTime(action.timestamp)}</p>
                        </DetailItem>
                    </div>
                    
                    {action.details?.duration && (
                        <DetailItem icon={<SparkleIcon className="w-4 h-4 text-gray-400" />} label="Generation Time">
                            <p className="text-cyan-300 text-sm font-mono">{action.details.duration.toFixed(2)} seconds</p>
                        </DetailItem>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminActionDetailModal;