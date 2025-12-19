/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { Analytics } from './AiPanelScreen';
import { UsersIcon, ChartBarIcon, ClockIcon, CurrencyDollarIcon, ChatBubbleIcon, SparkleIcon, CheckCircleIcon, ArrowPathIcon } from './icons';
import Spinner from './Spinner';

interface AdminDashboardPanelProps {
  analytics: Analytics | null;
  onRecalculate: () => void;
  isRecalculating: boolean;
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; }> = ({ title, value, icon, color }) => (
    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 flex items-start justify-between">
        <div>
            <p className="text-gray-400 text-sm font-medium">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
            {icon}
        </div>
    </div>
);

const CostBreakdownChart: React.FC<{ data: Analytics['costBreakdown'] }> = ({ data }) => {
    const totalCost = data.reduce((acc, item) => acc + item.cost, 0);
    if (totalCost === 0) {
        return <p className="text-sm text-gray-500 text-center py-4">No cost data available yet.</p>;
    }

    return (
        <div className="space-y-3">
            {data.map(item => (
                <div key={item.name} className="flex items-center gap-3 text-sm">
                    <span className="w-28 capitalize truncate text-gray-300">{item.name.replace(/([A-Z])/g, ' $1')}</span>
                    <div className="flex-1 bg-gray-700/80 rounded-full h-4">
                        <div
                            className="bg-gradient-to-r from-emerald-500 to-green-400 h-4 rounded-full"
                            style={{ width: `${(item.cost / totalCost) * 100}%` }}
                            title={`$${item.cost.toFixed(4)}`}
                        />
                    </div>
                    <span className="w-16 text-right font-mono text-xs text-white">${item.cost.toFixed(2)}</span>
                </div>
            ))}
        </div>
    );
};

const AreaChart: React.FC<{ data: { date: string; count: number }[] }> = ({ data }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const width = 300;
    const height = 100;
    const maxCount = Math.max(...data.map(d => d.count), 1);

    const createPath = () => {
        if (data.length < 2) return { line: '', area: `M0,${height} L${width},${height} Z` };

        const points = data.map((point, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (point.count / maxCount) * (height - 10); // Leave y-padding
            return [x, y] as [number, number];
        });

        const line = (points: [number, number][]) => {
            let d = `M ${points[0][0]} ${points[0][1]}`;
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i - 1] || points[i];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = points[i + 2] || p2;
                
                const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
                const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
                const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
                const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
            }
            return d;
        };
        
        const linePath = line(points);
        const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
        
        return { line: linePath, area: areaPath };
    };
    
    const { line, area } = createPath();
    const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;
    let tooltipX = 0;
    let tooltipY = 0;
    if (hoveredPoint && hoveredIndex !== null) {
        tooltipX = (hoveredIndex / (data.length - 1)) * width;
        tooltipY = height - (hoveredPoint.count / maxCount) * (height - 10);
    }

    return (
        <div className="relative h-48">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full absolute inset-0 overflow-visible" onMouseLeave={() => setHoveredIndex(null)}>
                <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.4"/>
                        <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0"/>
                    </linearGradient>
                </defs>
                <path d={area} fill="url(#areaGradient)" />
                <path d={line} fill="none" stroke="var(--color-primary-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {data.map((point, i) => {
                    const x = (i / (data.length - 1)) * width;
                    const y = height - (point.count / maxCount) * (height - 10);
                    return (
                        <g key={i} onMouseEnter={() => setHoveredIndex(i)} className="cursor-pointer">
                            <rect x={x - 10} y="0" width="20" height={height} fill="transparent" />
                            <circle cx={x} cy={y} r={hoveredIndex === i ? 5 : 3} fill="var(--color-primary-300)" className="transition-all" stroke="var(--color-primary-500)" strokeWidth={hoveredIndex === i ? 2 : 0} />
                        </g>
                    );
                })}
                {hoveredPoint && (
                    <g transform={`translate(${tooltipX}, ${tooltipY})`} className="pointer-events-none transition-opacity" style={{ opacity: 1 }}>
                        <rect x="-20" y="-30" width="40" height="20" rx="4" fill="rgba(0,0,0,0.8)" />
                        <text x="0" y="-16" textAnchor="middle" fill="#FFF" fontSize="10" fontWeight="bold">{hoveredPoint.count}</text>
                        <path d="M -4 -10 L 4 -10 L 0 -5 Z" fill="rgba(0,0,0,0.8)" />
                    </g>
                )}
            </svg>
            <div className="absolute inset-0 grid grid-rows-4 -z-10 pointer-events-none">
                <div className="border-b border-gray-700/50"></div>
                <div className="border-b border-gray-700/50"></div>
                <div className="border-b border-gray-700/50"></div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between -mb-5">
                {data.map(({ date }) => (
                    <span key={date} className="text-xs text-gray-400">{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                ))}
            </div>
        </div>
    );
};


const AdminDashboardPanel: React.FC<AdminDashboardPanelProps> = ({ analytics, onRecalculate, isRecalculating }) => {
    if (!analytics) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                    <Spinner />
                    <p className="mt-4 text-gray-400">Recalculating statistics...</p>
                </div>
            </div>
        );
    }
    
    const formatDuration = (seconds: number): string => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return `${minutes}m ${remainingSeconds}s`;
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
        return `${hours}h ago`;
    };

    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todaysActiveUsers = analytics.userActivityLog
        .filter(user => new Date(user.lastSeen).getTime() >= todayStart)
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Dashboard Overview</h2>
                <button
                    onClick={onRecalculate}
                    disabled={isRecalculating}
                    className="flex items-center gap-2 bg-gray-700/80 px-4 py-2 text-sm font-semibold text-gray-200 rounded-md hover:bg-gray-600/80 transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                    <ArrowPathIcon className={`w-5 h-5 ${isRecalculating ? 'animate-spin' : ''}`} />
                    Reset & Recalculate
                </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                {/* Main Column */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <StatCard title="Total Users" value={analytics.totalUsers} icon={<UsersIcon className="w-6 h-6 text-white" />} color="bg-blue-500/50" />
                        <StatCard title="Users Today" value={analytics.usersToday} icon={<ClockIcon className="w-6 h-6 text-white" />} color="bg-green-500/50" />
                        <StatCard title="Success Rate" value={`${analytics.successRate.toFixed(1)}%`} icon={<CheckCircleIcon className="w-6 h-6 text-white" />} color="bg-teal-500/50" />
                        <StatCard title="Est. API Cost" value={`$${analytics.estimatedCost.toFixed(2)}`} icon={<CurrencyDollarIcon className="w-6 h-6 text-white" />} color="bg-emerald-500/50" />
                        <StatCard title="Avg. Session" value={formatDuration(analytics.avgSessionDuration)} icon={<ChartBarIcon className="w-6 h-6 text-white" />} color="bg-yellow-500/50" />
                    </div>

                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                        <h2 className="text-lg font-semibold mb-4 text-gray-200">Daily Active Users (Last 7 Days)</h2>
                        <AreaChart data={analytics.dailyUniqueUsers} />
                    </div>

                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                        <h2 className="text-lg font-semibold mb-4 text-gray-200">Recent Actions</h2>
                        <ul className="space-y-3">
                            {analytics.allActions.slice(0, 5).map((action, index) => (
                                <li key={index} className="flex items-center justify-between gap-4 text-sm">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 flex-shrink-0"><SparkleIcon className="w-4 h-4 text-[var(--color-primary-300)]" /></span>
                                        <div className="overflow-hidden">
                                            <p className="font-medium text-gray-200 capitalize truncate">{action.feature.replace(/([A-Z])/g, ' $1')} by <span className="font-mono text-xs text-gray-400">{action.userName || action.userId.substring(0,8)}</span></p>
                                            {action.details?.prompt && <p className="text-xs text-gray-500 italic truncate">"{action.details.prompt}"</p>}
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-400 flex-shrink-0">{formatRelativeTime(action.timestamp)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Side Column */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 flex flex-col">
                        <h2 className="text-lg font-semibold mb-4 text-gray-200">Today's Active Users ({todaysActiveUsers.length})</h2>
                        {todaysActiveUsers.length > 0 ? (
                            <ul className="space-y-3 max-h-60 overflow-y-auto">
                                {todaysActiveUsers.map(user => (
                                    <li key={user.id} className="flex items-center justify-between gap-4 text-sm">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.id}`} alt="avatar" className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0" />
                                            <div className="overflow-hidden">
                                                <p className="font-medium text-gray-200 truncate">{user.name}</p>
                                                <p className="text-xs text-gray-500 font-mono truncate">{user.id}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-400 flex-shrink-0">{formatRelativeTime(user.lastSeen)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-4">No users have been active yet today.</p>
                        )}
                    </div>
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 flex flex-col">
                        <h2 className="text-lg font-semibold mb-4 text-gray-200">Cost Breakdown by Feature</h2>
                        <CostBreakdownChart data={analytics.costBreakdown} />
                    </div>
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 flex flex-col">
                        <h2 className="text-lg font-semibold mb-4 text-gray-200">Feature Usage & Latency</h2>
                        <div className="overflow-y-auto max-h-[28rem]">
                            <ul className="space-y-3">
                                {analytics.featureBreakdown.map((feature) => (
                                    <li key={feature.name} className="flex justify-between items-center text-sm">
                                        <div className="flex flex-col">
                                            <span className="capitalize text-gray-300">{feature.name.replace(/([A-Z])/g, ' $1')}</span>
                                            {feature.avgTime !== null && <span className="text-xs text-cyan-400 font-mono">Avg: {feature.avgTime.toFixed(2)}s</span>}
                                        </div>
                                        <span className="font-bold text-white bg-gray-700 px-2 py-0.5 rounded-md">{feature.count}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 flex flex-col">
                        <div className='flex items-center gap-2 mb-4'>
                            <ChatBubbleIcon className="w-5 h-5 text-fuchsia-400" />
                            <h2 className="text-lg font-semibold text-gray-200">Top User Prompts</h2>
                        </div>
                        {analytics.topPrompts.length > 0 ? (
                            <ul className="space-y-3 flex-1 overflow-y-auto max-h-60">
                                {analytics.topPrompts.map(([prompt, count]) => (
                                    <li key={prompt} className="flex justify-between items-start gap-4 text-sm">
                                        <span className="text-gray-300 italic">"{prompt}"</span>
                                        <span className="font-bold text-white bg-fuchsia-500/30 px-2 py-0.5 rounded-md flex-shrink-0">{count}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-4">No prompt data recorded yet.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPanel;