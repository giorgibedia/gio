/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Analytics } from './AiPanelScreen';
import { CheckCircleIcon, ExclamationTriangleIcon, FlagIcon } from './icons';

interface AdminSystemHealthProps {
  analytics: Analytics;
}

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

// This is a simulation for demonstration purposes.
// In a real app, this data would come from the Gemini API's `promptFeedback`.
const getSimulatedSafetyFlags = (actions: Analytics['allActions']) => {
    const flagged = [];
    const sensitiveKeywords = ['naked', 'blood', 'violence', 'gun', 'hate'];
    
    for (const action of actions) {
        if (action.details?.prompt) {
            const promptLower = action.details.prompt.toLowerCase();
            const foundKeyword = sensitiveKeywords.find(kw => promptLower.includes(kw));
            if (foundKeyword) {
                flagged.push({
                    ...action,
                    flagReason: `Potential violation: Contains keyword "${foundKeyword}".`,
                    blockReason: 'SAFETY', // Simulate a block reason
                });
            }
        }
    }
    return flagged.slice(0, 10); // Show top 10 for demonstration
}

const AdminSystemHealth: React.FC<AdminSystemHealthProps> = ({ analytics }) => {
    if (!analytics) return null;
    
    const { allErrors, errorTrends, allActions } = analytics;
    const maxDailyErrors = Math.max(...errorTrends.map(d => d.count), 1);
    
    const safetyFlags = getSimulatedSafetyFlags(allActions);

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
             <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-200">Daily Error Count (Last 7 Days)</h2>
                {allErrors.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-center">
                        <CheckCircleIcon className="w-8 h-8 text-green-400 mr-3" />
                        <div>
                            <p className="text-gray-300 font-semibold">System Healthy</p>
                            <p className="text-gray-400 text-sm">No errors recorded in the last 7 days.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-end justify-between h-48 gap-2">
                        {errorTrends.map(({ date, count }) => (
                            <div key={date} className="flex-1 flex flex-col items-center justify-end gap-2 group">
                                <span className="text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity text-white">{count}</span>
                                <div className="w-full bg-gradient-to-t from-red-600 to-red-500 rounded-t-md hover:from-red-500 hover:to-red-400 transition-colors" style={{ height: `${(count / maxDailyErrors) * 100}%` }}></div>
                                <span className="text-xs text-gray-400">{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <FlagIcon className="w-6 h-6 text-orange-400" />
                    <h2 className="text-lg font-semibold text-gray-200">Content Moderation: Safety Flags</h2>
                </div>
                {safetyFlags.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">No potentially unsafe prompts detected recently.</p>
                ) : (
                     <div className="overflow-y-auto max-h-96">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase sticky top-0 bg-gray-800/80 backdrop-blur-sm">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Time</th>
                                    <th scope="col" className="px-4 py-2">Flagged Prompt</th>
                                    <th scope="col" className="px-4 py-2">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {safetyFlags.map((flag, index) => (
                                    <tr key={index} className="hover:bg-gray-700/50">
                                        <td className="px-4 py-2 whitespace-nowrap">{formatRelativeTime(flag.timestamp)}</td>
                                        <td className="px-4 py-2 text-orange-300 text-xs font-mono" title={flag.details.prompt}>{flag.details.prompt}</td>
                                        <td className="px-4 py-2 text-xs">
                                            <span className="bg-red-500/20 text-red-300 font-bold px-2 py-1 rounded-full">{flag.blockReason}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                    <ExclamationTriangleIcon className="w-6 h-6 text-yellow-400" />
                    <h2 className="text-lg font-semibold text-gray-200">Full Error Log</h2>
                </div>
                
                {allErrors.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">No errors to display.</p>
                ) : (
                    <div className="overflow-y-auto max-h-96">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-400 uppercase sticky top-0 bg-gray-800/80 backdrop-blur-sm">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Time</th>
                                    <th scope="col" className="px-4 py-2">Feature</th>
                                    <th scope="col" className="px-4 py-2">Error Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {allErrors.map((err, index) => (
                                    <tr key={index} className="hover:bg-gray-700/50">
                                        <td className="px-4 py-2 whitespace-nowrap" title={new Date(err.timestamp).toLocaleString()}>{formatRelativeTime(err.timestamp)}</td>
                                        <td className="px-4 py-2 capitalize font-medium text-white">{err.feature.replace(/([A-Z])/g, ' $1')}</td>
                                        <td className="px-4 py-2 text-red-400 text-xs font-mono" title={err.message}>{err.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSystemHealth;