/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
// FIX: `database` and `isFirebaseConfigured` are exported from `firebase.ts`, not `analyticsService.ts`.
import { database, isFirebaseConfigured, auth } from '../services/firebase';
import { ref, onValue, off } from 'firebase/database';
import { ChartBarIcon, UsersIcon, ShieldExclamationIcon, ClipboardDocumentListIcon, WrenchScrewdriverIcon, CubeIcon } from './icons';
import Spinner from './Spinner';
import AdminDashboardPanel from './AdminDashboardPanel';
import AdminUsersPanel from './AdminUsersPanel';
import AdminSystemHealth from './AdminSystemHealth';
import AdminActionLog from './AdminActionLog';
import AdminUserDetailModal from './AdminUserDetailModal';
import AdminActionDetailModal from './AdminActionDetailModal';
import { useAuth } from '../AuthContext';

const AdminPromptsPanel = lazy(() => import('./AdminPromptsPanel'));
const AdminImageFeedPanel = lazy(() => import('./AdminImageFeedPanel'));


interface AdminPanelScreenProps {
  onClose?: () => void; // Keep for potential future use, but not used for navigation now
}

export type Analytics = ReturnType<typeof processAnalyticsData>;
export type ProcessedUser = Analytics['userActivityLog'][0];
export type ActionWithUser = Analytics['allActions'][0] & { userName?: string; platform?: 'mobile_app' | 'web' };

type AdminTab = 'dashboard' | 'users' | 'actionLog' | 'systemHealth' | 'prompts' | 'generations';

// Helper to get date strings
const getPastDateString = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};

const processAnalyticsData = (users: any, actions: any, errors: any) => {
    const allActionsRaw = actions ? Object.entries(actions) as [string, any][] : [];
    const allErrorsRaw = errors ? Object.values(errors) as any[] : [];
    const allUsers = users ? Object.entries(users) as [string, any][] : [];
    
    const allActions = allActionsRaw
        .map(([key, action]) => ({ ...action, id: key, timestamp: new Date(action.timestamp).toISOString() }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const allErrors = allErrorsRaw
        .map(e => ({ ...e, timestamp: new Date(e.timestamp).toISOString() }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const usersMap = new Map<string, any>();

    // 1. Populate with registered user data
    allUsers.forEach(([id, user]) => {
        usersMap.set(id, {
            ...user,
            id,
            name: user.name || user.email || (user.isAnonymous ? 'Guest' : 'Anonymous'),
            isRegistered: !user.isAnonymous,
        });
    });

    // 2. Derive first/last seen times from the action log for all users who have actions
    // Also track the last platform used
    const actionTimestamps = new Map<string, { first: string, last: string, lastPlatform?: string }>();
    allActions.forEach(action => {
        if (!actionTimestamps.has(action.userId)) {
            // Because actions are sorted newest-to-oldest, the first time we see a user,
            // it's their most recent ('last') action.
            actionTimestamps.set(action.userId, { 
                first: action.timestamp, 
                last: action.timestamp,
                lastPlatform: action.platform 
            });
        } else {
            // Any subsequent action we see for this user is older, so we update their 'first' seen time.
            actionTimestamps.get(action.userId)!.first = action.timestamp;
        }
    });

    // 3. Merge action-derived data into the main usersMap
    actionTimestamps.forEach((times, userId) => {
        const existingUser = usersMap.get(userId);
        if (existingUser) {
            existingUser.firstSeen = times.first;
            existingUser.lastSeen = times.last;
            existingUser.lastPlatform = times.lastPlatform;
        } else {
            usersMap.set(userId, {
                id: userId,
                name: 'Anonymous', // Explicitly name them Anonymous for the panel
                email: 'N/A',
                firstSeen: times.first,
                lastSeen: times.last,
                lastPlatform: times.lastPlatform,
                isRegistered: false,
            });
        }
    });

    // Add userName to each action for other parts of the panel
    allActions.forEach((action: any) => {
        action.userName = usersMap.get(action.userId)?.name || 'Unknown User';
    });
    
    const userActionCount = new Map<string, number>();
    allActions.forEach(a => userActionCount.set(a.userId, (userActionCount.get(a.userId) || 0) + 1));

    const userActivityLog = Array.from(usersMap.values()).map(user => ({
        id: user.id,
        firstSeen: user.firstSeen ? new Date(user.firstSeen).toISOString() : 'N/A',
        lastSeen: user.lastSeen ? new Date(user.lastSeen).toISOString() : 'N/A',
        lastPlatform: user.lastPlatform,
        actionCount: userActionCount.get(user.id) || 0,
        email: user.email || 'N/A',
        name: user.name,
    })).filter(u => u.actionCount > 0);
    
    const totalUsers = userActivityLog.length;
    const usersToday = userActivityLog.filter((user) => new Date(user.lastSeen).getTime() >= todayStart).length;
    const usersThisWeek = userActivityLog.filter((user) => new Date(user.lastSeen).getTime() >= oneWeekAgo).length;

    const dailyUniqueUsersMap = new Map<string, Set<string>>();
    allActions.forEach(action => {
        const timestamp = new Date(action.timestamp).getTime();
        if (timestamp >= oneWeekAgo) {
            const dateStr = new Date(timestamp).toISOString().split('T')[0];
            if (!dailyUniqueUsersMap.has(dateStr)) {
                dailyUniqueUsersMap.set(dateStr, new Set());
            }
            dailyUniqueUsersMap.get(dateStr)!.add(action.userId);
        }
    });

    const dailyUniqueUsers = Array(7).fill(0).map((_, i) => {
        const date = getPastDateString(6-i);
        return { date, count: dailyUniqueUsersMap.get(date)?.size || 0 };
    });

    const featureMap = new Map<string, { count: number; totalTime: number; timeEntries: number }>();
    const promptMap = new Map<string, number>();

    allActions.forEach(action => {
        if (!featureMap.has(action.feature)) {
            featureMap.set(action.feature, { count: 0, totalTime: 0, timeEntries: 0 });
        }
        const feature = featureMap.get(action.feature)!;
        feature.count++;
        if (action.details?.duration) {
            feature.totalTime += action.details.duration;
            feature.timeEntries++;
        }
        if(action.details?.prompt && typeof action.details.prompt === 'string') {
            const p = action.details.prompt.trim().toLowerCase();
            if(p) promptMap.set(p, (promptMap.get(p) || 0) + 1);
        }
    });
    
    const featureBreakdown = Array.from(featureMap.entries()).map(([name, data]) => ({
        name,
        count: data.count,
        avgTime: data.timeEntries > 0 ? data.totalTime / data.timeEntries : null,
    })).sort((a,b) => b.count - a.count);

    const topPrompts = Array.from(promptMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    const errorTrendsMap = new Map<string, number>();
    allErrors.forEach(error => {
        const dateStr = new Date(error.timestamp).toISOString().split('T')[0];
        if (new Date(error.timestamp).getTime() >= oneWeekAgo) {
            errorTrendsMap.set(dateStr, (errorTrendsMap.get(dateStr) || 0) + 1);
        }
    });
    const errorTrends = Array(7).fill(0).map((_, i) => {
        const date = getPastDateString(6-i);
        return { date, count: errorTrendsMap.get(date) || 0 };
    });
    
    const costMap: Record<string, number> = {
        'retouch': 0.0015,
        'background': 0.0015,
        'magicEdit': 0.0012,
        'composeImages': 0.0020,
        'generateImage': 0.0080,
        'assistant': 0.0001,
        'default': 0.0005
    };
    let totalCost = 0;
    const costByFeature = new Map<string, number>();
    allActions.forEach(action => {
        const cost = costMap[action.feature] || costMap['default'];
        totalCost += cost;
        costByFeature.set(action.feature, (costByFeature.get(action.feature) || 0) + cost);
    });
    
    const costBreakdown = Array.from(costByFeature.entries())
        .map(([name, cost]) => ({ name, cost }))
        .sort((a, b) => b.cost - a.cost);

    const totalActionsCount = allActions.length;
    const totalErrorsCount = allErrors.length;
    const successRate = totalActionsCount > 0 ? ((totalActionsCount - totalErrorsCount) / totalActionsCount) * 100 : 100;
    
    const userSessions = new Map<string, {min: number, max: number}>();
    allActionsRaw.forEach(([,a]) => {
        const timestamp = a.timestamp;
        if (timestamp >= todayStart) {
            if(!userSessions.has(a.userId)) {
                userSessions.set(a.userId, {min: timestamp, max: timestamp});
            } else {
                const session = userSessions.get(a.userId)!;
                session.min = Math.min(session.min, timestamp);
                session.max = Math.max(session.max, timestamp);
            }
        }
    });
    let totalDuration = 0;
    userSessions.forEach(session => totalDuration += (session.max - session.min));
    const avgSessionDuration = userSessions.size > 0 ? (totalDuration / userSessions.size) / 1000 : 0;

    return {
        isConfigured: true, totalUsers, usersToday, usersThisWeek, dailyUniqueUsers, featureBreakdown,
        userActivityLog, topPrompts, allErrors, allActions,
        estimatedCost: totalCost, avgSessionDuration, errorTrends,
        costBreakdown, successRate,
    };
}


const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({ onClose }) => {
  const { user, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [selectedUser, setSelectedUser] = useState<ProcessedUser | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionWithUser | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const [rawData, setRawData] = useState<{
    users: any | null;
    actions: any | null;
    errors: any | null;
  }>({ users: null, actions: null, errors: null });

  // Effect for initial data loading
  useEffect(() => {
    // PREVENT PERMISSION_DENIED:
    // Only fetch if Firebase is configured AND the user is logged in.
    // Anonymous users do not have access to admin data.
    if (!isFirebaseConfigured || !database || authLoading) {
        return;
    }
    
    if (!user || user.isAnonymous) {
         setError("You do not have permission to view analytics. Please sign in as an admin.");
         setIsLoading(false);
         return;
    }

    // This function checks if all initial data snapshots have arrived (or failed gracefully).
    const checkInitialDataLoaded = (currentRawData: typeof rawData) => {
        if (currentRawData.users !== null && currentRawData.actions !== null && currentRawData.errors !== null) {
            setIsLoading(false);
        }
    };

    // Separate error handlers for each data node.
    // This allows partial loading: e.g., if /errors is restricted, we still load users and actions.
    const handleDataSuccess = (key: 'users' | 'actions' | 'errors', snapshot: any) => {
        setRawData(prev => {
            const newData = { ...prev, [key]: snapshot.val() || {} };
            checkInitialDataLoaded(newData);
            return newData;
        });
    };

    const handleDataError = (key: 'users' | 'actions' | 'errors', err: Error) => {
        console.warn(`Failed to fetch ${key} (likely PERMISSION_DENIED):`, err);
        // Important: Set to empty object instead of failing, so other parts of dashboard can load
        setRawData(prev => {
            const newData = { ...prev, [key]: {} }; 
            checkInitialDataLoaded(newData);
            return newData;
        });
    };
    
    const usersRef = ref(database, 'users');
    const actionsRef = ref(database, 'actions');
    const errorsRef = ref(database, 'errors');
    
    // Set up listeners for each data node
    const onUsers = onValue(
        usersRef, 
        (snap) => handleDataSuccess('users', snap), 
        (err) => handleDataError('users', err)
    );

    const onActions = onValue(
        actionsRef, 
        (snap) => handleDataSuccess('actions', snap), 
        (err) => handleDataError('actions', err)
    );

    const onErrors = onValue(
        errorsRef, 
        (snap) => handleDataSuccess('errors', snap), 
        (err) => handleDataError('errors', err)
    );

    // Cleanup function to detach listeners on component unmount.
    return () => {
      off(usersRef, 'value', onUsers);
      off(actionsRef, 'value', onActions);
      off(errorsRef, 'value', onErrors);
    };
  }, [user, authLoading]);

  // Effect to process data in real-time after the initial load.
  useEffect(() => {
    if (isLoading) return;

    const { users, actions, errors } = rawData;
    // Only process if all parts have been attempted (even if empty)
    if (users !== null && actions !== null && errors !== null) {
      try {
        const processed = processAnalyticsData(users, actions, errors);
        setAnalytics(processed);
      } catch(e) {
        console.error("Error processing analytics data:", e);
        // Do NOT block UI here, just log error.
      }
    }
  }, [rawData, isLoading]);

  const handleRecalculate = () => {
    setIsRecalculating(true);
    setTimeout(() => {
        if (rawData.users !== null && rawData.actions !== null && rawData.errors !== null) {
          try {
            const processed = processAnalyticsData(rawData.users, rawData.actions, rawData.errors);
            setAnalytics(processed);
          } catch(e) {
            console.error("Error processing analytics data during recalculation:", e);
          }
        }
        setIsRecalculating(false);
    }, 800);
  };

  const UnconfiguredState = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">Firebase Not Configured</h2>
        <p className="text-gray-300 max-w-lg">
            To enable centralized analytics, you need to connect this app to a Firebase Realtime Database.
        </p>
        <p className="mt-4 text-gray-400 text-sm max-w-lg">
            Please follow the instructions in <code className="bg-gray-700 p-1 rounded-md text-xs font-mono">services/firebase.ts</code> to set up your project and add your configuration keys.
        </p>
    </div>
  );

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-full">
      <Spinner />
      <p className="mt-4 text-lg text-gray-400">Loading Analytics...</p>
    </div>
  );

  const ErrorState = () => (
     <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Error Loading Analytics</h2>
        <p className="text-gray-300 max-w-lg">
            {error || "There was a problem fetching the data. Ensure your account has Admin permissions."}
        </p>
    </div>
  );
  
  const tabs: { id: AdminTab; label: string; icon: React.ReactElement }[] = [
      { id: 'dashboard', label: 'Dashboard', icon: <ChartBarIcon className="w-5 h-5" /> },
      { id: 'users', label: 'Users', icon: <UsersIcon className="w-5 h-5" /> },
      { id: 'actionLog', label: 'Action Log', icon: <ClipboardDocumentListIcon className="w-5 h-5" /> },
      { id: 'generations', label: 'Generations', icon: <CubeIcon className="w-5 h-5" /> },
      { id: 'systemHealth', label: 'System Health', icon: <ShieldExclamationIcon className="w-5 h-5" /> },
      { id: 'prompts', label: 'Prompts', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
  ];

  const renderContent = () => {
    if (!isFirebaseConfigured) return <UnconfiguredState />;
    if (isLoading) return <LoadingState />;
    if (error && !analytics) return <ErrorState />;
    if (!analytics) return <div className="flex-1">{LoadingState()}</div>;
    
    const activePanel = () => {
        switch(activeTab) {
            case 'dashboard': return <AdminDashboardPanel analytics={analytics} onRecalculate={handleRecalculate} isRecalculating={isRecalculating} />;
            case 'users': return <AdminUsersPanel analytics={analytics} onUserSelect={setSelectedUser} />;
            case 'actionLog': return <AdminActionLog analytics={analytics} onActionSelect={setSelectedAction} />;
            case 'generations': return <AdminImageFeedPanel analytics={analytics} />;
            case 'systemHealth': return <AdminSystemHealth analytics={analytics} />;
            case 'prompts': return <AdminPromptsPanel />;
            default: return null;
        }
    }
    
    return (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            <nav className="hidden md:block w-56 bg-gray-900/40 p-4 border-r border-gray-700/60 flex-shrink-0">
                <div className="flex flex-col gap-2">
                    {tabs.map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)} 
                            className={`flex items-center gap-3 w-full text-left p-3 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-[var(--color-primary-500)] text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>
            <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-900">
                <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Spinner /></div>}>
                    {activePanel()}
                </Suspense>
            </main>
        </div>
    );
  };
  
  return (
    <>
      <div className="min-h-screen bg-gray-900 flex flex-col text-gray-200">
        <header className="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0 md:p-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold md:text-xl">Admin Panel</h1>
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors ${isLoading ? 'bg-yellow-400 animate-pulse' : (error ? 'bg-red-500' : 'bg-green-500')}`}></div>
                <span className="text-xs text-gray-400">
                    {isLoading ? 'Connecting...' : (error ? 'Error' : 'Live')}
                </span>
            </div>
          </div>
          <div className="md:hidden">
              <select 
                onChange={(e) => setActiveTab(e.target.value as AdminTab)} 
                value={activeTab} 
                className="bg-gray-800 border border-gray-600 rounded-md p-2 text-sm focus:ring-blue-500 focus:outline-none"
              >
                  {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
              </select>
          </div>
        </header>
        {renderContent()}
      </div>
      {selectedUser && analytics && (
          <AdminUserDetailModal 
              user={selectedUser} 
              allActions={analytics.allActions} 
              onClose={() => setSelectedUser(null)} 
          />
      )}
      {selectedAction && (
          <AdminActionDetailModal 
              action={selectedAction} 
              onClose={() => setSelectedAction(null)} 
          />
      )}
    </>
  );
};

export default AdminPanelScreen;