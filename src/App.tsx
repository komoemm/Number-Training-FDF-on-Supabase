/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { supabase, isSupabaseActive, isSupabaseConfigured } from './supabase';
import { 
  generateRandomInvoiceNumber, 
  generateRandomDateNumber, 
  generateRandomPhoneNumber 
} from './utils/numberGenerators';
import {
  InvoiceViewerSkeleton,
  CategorySandboxSkeleton,
  HistoryLogsSkeleton,
  StatsPanelSkeleton,
  LoginScreenSkeleton
} from './components/SkeletonLoaders';
import TypingInputStation, { TypingCardMetrics } from './components/TypingInputStation';
import { 
  evaluateCategoryLevel, 
  getCategoryRankDetails, 
  evaluateAllInOneSession, 
  AllInOneEvaluation,
  CATEGORY_SLA_CONFIG 
} from './utils/speedRanking';
import { GeneratedInvoiceData, TypingDetail, TestSession, TrainingMode, TrainingCategory } from './types';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useLanguage } from './context/LanguageContext';
import { 
  Zap, Keyboard, ShieldAlert, CheckCircle2, ChevronRight, ChevronLeft,
  RotateCcw, LogOut, HelpCircle, Trophy, BarChart2, Check, X,
  Clock, Database, Award, Download, Users, FileText, Calendar, Phone,
  Sparkles, ShieldCheck, AlertCircle, Layers, Play, Eye, EyeOff, Shield,
  ImagePlus, FolderUp
} from 'lucide-react';

function formatMinutesSeconds(totalMs: number): string {
  const totalSec = Math.floor(totalMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Lazy-loaded heavy components to optimize initial bundle size, LCP, and INP
const LoginScreen = lazy(() => import('./components/LoginScreen'));
const CategorySandbox = lazy(() => import('./components/CategorySandbox').then(m => ({ default: m.default || m.CategorySandbox })));
const StatsPanel = lazy(() => import('./components/StatsPanel'));
const HistoryLogs = lazy(() => import('./components/HistoryLogs'));
const InvoiceViewer = lazy(() => import('./components/InvoiceViewer'));

/**
 * Accessible minimal fallback loading spinner using Tailwind CSS for Suspense fallbacks
 */
export function LoadingSpinner({ 
  message = 'Loading component...',
  className = 'p-8 min-h-[140px]'
}: { 
  message?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-col items-center justify-center w-full rounded-2xl bg-slate-50/70 border border-slate-200/60 ${className}`}
    >
      <div className="flex items-center space-x-3 text-slate-500">
        <div
          className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shrink-0"
          aria-hidden="true"
        />
        <span className="text-xs font-semibold text-slate-600 tracking-wide font-sans">{message}</span>
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
}

const LoadingFallback = LoadingSpinner;

export default function App() {
  const { t, language } = useLanguage();

  // Application & System states
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Local Offline User States
  const [currentOfflineUser, setCurrentOfflineUser] = useState<any>(() => {
    try {
      const savedUser = localStorage.getItem('trainer_logged_in_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [localUsers, setLocalUsers] = useState<any[]>(() => {
    try {
      const savedUsers = localStorage.getItem('trainer_sandbox_users');
      if (savedUsers) {
        return JSON.parse(savedUsers);
      }
    } catch {}
    // Initial standard trainer users seed
    return [
      { username: 'admin', passwordText: 'admin', role: 'admin', createdAt: '2026-05-22' },
      { username: 'guest', passwordText: 'guest', role: 'trainee', createdAt: '2026-05-22' }
    ];
  });

  const [newTraineeUsername, setNewTraineeUsername] = useState<string>('');
  const [newTraineePassword, setNewTraineePassword] = useState<string>('');
  const [userCreationError, setUserCreationError] = useState<string | null>(null);
  const [userCreationSuccess, setUserCreationSuccess] = useState<string | null>(null);

  // States for bulk operator creation
  const [operatorInputMode, setOperatorInputMode] = useState<'single' | 'bulk'>('single');
  const [bulkInputText, setBulkInputText] = useState<string>('');
  const [bulkDefaultPass, setBulkDefaultPass] = useState<string>('trainee123');

  // Track trainee user account slated for deletion confirmation
  const [userPendingDelete, setUserPendingDelete] = useState<string | null>(null);

  // Persist local operators directory
  useEffect(() => {
    localStorage.setItem('trainer_sandbox_users', JSON.stringify(localUsers));
  }, [localUsers]);

  const recordLoginHistory = async (username: string, role: string, success: boolean) => {
    const now = new Date();
    const logId = `login_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`;
    const logEntry = {
      id: logId,
      username,
      role,
      success,
      timestamp: now.toISOString(),
      userAgent: navigator.userAgent || 'unknown_agent'
    };

    // 1. Local Storage
    try {
      const localHistoryData = localStorage.getItem('local_login_history');
      const list = localHistoryData ? JSON.parse(localHistoryData) : [];
      localStorage.setItem('local_login_history', JSON.stringify([logEntry, ...list]));
    } catch (err) {
      console.error('Failed writing login log to local storage:', err);
    }

    // 2. Supabase cloud storage
    if (isSupabaseActive) {
      try {
        await supabase.from('login_history').insert([{
          id: logId,
          username,
          role,
          success,
          user_agent: navigator.userAgent || 'unknown_agent',
          created_at: now.toISOString()
        }]);
      } catch (err) {
        console.warn('Notice writing login log to Supabase:', err);
      }
    }
  };

  const handleOfflineLogin = (username: string, passwordText: string) => {
    const cleanUser = username.trim().toLowerCase();
    const matched = localUsers.find(u => u.username.toLowerCase() === cleanUser && u.passwordText === passwordText);
    if (!matched) {
      recordLoginHistory(username, 'unknown', false);
      return { success: false, error: 'Invalid username or access password.' };
    }
    setCurrentOfflineUser(matched);
    localStorage.setItem('trainer_logged_in_user', JSON.stringify(matched));
    recordLoginHistory(matched.username, matched.role, true);
    // Trainees and admins automatically load fresh active published pool images & labels from Supabase
    fetchCustomInvoices(true);
    return { success: true };
  };

  const handleOfflineLogout = () => {
    setCurrentOfflineUser(null);
    localStorage.removeItem('trainer_logged_in_user');
    setIsTestActive(false);
    setTestComplete(false);
  };

  const handleCreateTraineeUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserCreationError(null);
    setUserCreationSuccess(null);

    const cleanUsername = newTraineeUsername.trim();
    const cleanPassword = newTraineePassword.trim();

    if (!cleanUsername || cleanUsername.length < 3) {
      setUserCreationError('Username must be at least 3 characters long.');
      return;
    }

    if (!cleanPassword || cleanPassword.length < 3) {
      setUserCreationError('Password must be at least 3 characters long.');
      return;
    }

    const usernameLower = cleanUsername.toLowerCase();
    const isDuplicate = localUsers.some(u => u.username.toLowerCase() === usernameLower);
    if (isDuplicate) {
      setUserCreationError(`User account "${cleanUsername}" already exists in operator registry.`);
      return;
    }

    const newOperator = {
      username: cleanUsername,
      passwordText: cleanPassword,
      role: 'trainee',
      createdAt: new Date().toISOString().split('T')[0]
    };

    const updatedUsers = [...localUsers, newOperator];
    setLocalUsers(updatedUsers);
    try {
      sessionStorage.setItem('cached_sandbox_users', JSON.stringify({
        timestamp: Date.now(),
        data: updatedUsers
      }));
    } catch {}

    if (isSupabaseActive) {
      try {
        const userPayload = {
          username: cleanUsername,
          password_text: cleanPassword,
          role: 'trainee',
          created_at: new Date().toISOString()
        };
        await supabase.from('sandbox_users').upsert(userPayload);
      } catch (err) {
        console.warn('Failed to sync new trainee profile to Supabase:', err);
      }
    }

    setNewTraineeUsername('');
    setNewTraineePassword('');
    setUserCreationSuccess(`Successfully created trainee operator account: "${cleanUsername}".`);
  };

  const handleBatchCreateOperators = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserCreationError(null);
    setUserCreationSuccess(null);

    const lines = bulkInputText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      setUserCreationError('Please enter at least one operator username or row.');
      return;
    }

    const defaultPass = bulkDefaultPass.trim() || 'trainee123';
    const today = new Date().toISOString().split('T')[0];

    const existingUsernamesLower = new Set(localUsers.map(u => u.username.toLowerCase()));
    const createdUsers: any[] = [];
    const skippedUsers: string[] = [];
    const invalidFormatUsers: string[] = [];

    for (const rawLine of lines) {
      let uname = '';
      let pass = defaultPass;

      if (rawLine.includes(',') || rawLine.includes('\t')) {
        const parts = rawLine.split(/[,\\t]+/).map(p => p.trim());
        uname = parts[0];
        if (parts[1] && parts[1].length > 0) {
          pass = parts[1];
        }
      } else {
        uname = rawLine;
      }

      if (!uname || uname.length < 3) {
        invalidFormatUsers.push(rawLine);
        continue;
      }

      const unameLower = uname.toLowerCase();
      if (existingUsernamesLower.has(unameLower)) {
        skippedUsers.push(uname);
        continue;
      }

      createdUsers.push({
        username: uname,
        passwordText: pass,
        role: 'trainee',
        createdAt: today
      });
      existingUsernamesLower.add(unameLower);
    }

    if (createdUsers.length === 0) {
      let errText = 'No new valid operator profiles were identified.';
      if (skippedUsers.length > 0) {
        errText += ` Skipped duplicates: ${skippedUsers.join(', ')}.`;
      }
      if (invalidFormatUsers.length > 0) {
        errText += ` Invalid format or too short (<3 chars): ${invalidFormatUsers.join(', ')}.`;
      }
      setUserCreationError(errText);
      return;
    }

    // 1. Sync to memory & Local Storage
    const allUsersBatch = [...localUsers, ...createdUsers];
    setLocalUsers(allUsersBatch);
    try {
      sessionStorage.setItem('cached_sandbox_users', JSON.stringify({
        timestamp: Date.now(),
        data: allUsersBatch
      }));
    } catch {}

    // 2. Sync to Supabase in parallel
    if (isSupabaseActive) {
      try {
        const payloads = createdUsers.map((user) => ({
          username: user.username,
          password_text: user.passwordText,
          role: user.role,
          created_at: new Date().toISOString()
        }));
        await supabase.from('sandbox_users').upsert(payloads);
      } catch (err) {
        console.warn('Failed to batch sync profiles to Supabase database:', err);
        setUserCreationError('Profiles written locally, but some failed cloud database synchronization.');
      }
    }

    setBulkInputText('');
    
    let successMsg = `Successfully batch-provisioned ${createdUsers.length} trainee operator accounts.`;
    if (skippedUsers.length > 0) {
      successMsg += ` Skipped ${skippedUsers.length} duplicates.`;
    }
    if (invalidFormatUsers.length > 0) {
      successMsg += ` (Failed to import ${invalidFormatUsers.length} rows due to invalid formats).`;
    }
    setUserCreationSuccess(successMsg);
  };

  const handleDeleteTraineeUser = async (uname: string, force?: boolean) => {
    if (uname.toLowerCase() === 'admin') {
      setUserCreationError('The root system admin account is permanent.');
      return;
    }
    
    if (force || userPendingDelete === uname) {
      const unameLower = uname.toLowerCase();
      const filteredUsers = localUsers.filter(u => u.username.toLowerCase() !== unameLower);
      setLocalUsers(filteredUsers);
      try {
        sessionStorage.setItem('cached_sandbox_users', JSON.stringify({
          timestamp: Date.now(),
          data: filteredUsers
        }));
      } catch {}
      
      if (isSupabaseActive) {
        try {
          await supabase.from('sandbox_users').delete().eq('username', uname);
        } catch (err) {
          console.warn('Failed to delete profile from Supabase:', err);
        }
      }

      setUserCreationSuccess(`Removed trainee operator: "${uname}".`);
      setUserPendingDelete(null);
    } else {
      setUserPendingDelete(uname);
      setTimeout(() => {
        setUserPendingDelete(current => current === uname ? null : current);
      }, 5000);
    }
  };

  // Setup tabs selection: Unified All-In-One Speed Training + Admin Users + Admin Card Pools
  const [activeSetupTab, setActiveSetupTab] = useState<'all_in_one' | 'users' | 'catalog'>('all_in_one');
  const [activeTrainingCategory, setActiveTrainingCategory] = useState<TrainingCategory>('all_in_one');
  
  // Custom invoices uploaded from local system (multi-category support)
  const [customInvoices, setCustomInvoices] = useState<(GeneratedInvoiceData & { customImageUrl?: string })[]>(() => {
    try {
      const saved = localStorage.getItem('custom_uploaded_invoices');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed
          .filter((item: any) => {
            if (!item || !item.customImageUrl) return false;
            if (typeof item.id === 'string' && (item.id.startsWith('sample_') || item.id.startsWith('custom_sample_') || item.id.includes('_sample_'))) return false;
            return true;
          })
          .map((item: any) => ({
            ...item,
            category: item.category || 'tax_number'
          }));
      }
      return [];
    } catch {
      return [];
    }
  });

  // Custom invoice creation fields states
  const [customExpectedCode, setCustomExpectedCode] = useState<string>('');
  const [customCompanyName, setCustomCompanyName] = useState<string>('');
  const [uploadProgressError, setUploadProgressError] = useState<string | null>(null);
  
  // Custom bulk labeling & previewing indices
  const [labelingModalIndex, setLabelingModalIndex] = useState<number | null>(null);

  // Core Speed Test States
  const [isTestActive, setIsTestActive] = useState<boolean>(false);
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('all_in_one_100');
  const [isConfirmingCancel, setIsConfirmingCancel] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [expectedDataset, setExpectedDataset] = useState<GeneratedInvoiceData[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  
  // Timer States
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);

  // Session stats & Strict Mistakes Rule tracking
  const [sessionResults, setSessionResults] = useState<TypingDetail[]>([]);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakesCount, setMistakesCount] = useState<number>(0);
  const [mistakesList, setMistakesList] = useState<Array<{
    cardIndex: number;
    imageId: string;
    category: TrainingCategory;
    expectedNumber: string;
    typedNumber: string;
    timeSpentMs: number;
  }>>([]);
  const [averageTimeMs, setAverageTimeMs] = useState<number>(0);
  const [sessionTotalTimeMs, setSessionTotalTimeMs] = useState<number>(0);
  const [showErrorReview, setShowErrorReview] = useState<boolean>(false);
  const [latestEvaluation, setLatestEvaluation] = useState<AllInOneEvaluation | null>(null);

  // Page level display state managers
  const [testComplete, setTestComplete] = useState<boolean>(false);
  const [, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cheatTriggerMsg, setCheatTriggerMsg] = useState<string | null>(null);
  const [latestSessionByMe, setLatestSessionByMe] = useState<any>(null);
  const [isRefreshingInvoices, setIsRefreshingInvoices] = useState<boolean>(false);
  // Admin-only toggle to unhide/hide Speed Dashboard, Trainee Logs, and Login History
  const [showAdminLogs, setShowAdminLogs] = useState<boolean>(false);

  const TEN_MINUTES_MS = 10 * 60 * 1000;

  useEffect(() => {
    if (!currentOfflineUser || isTestActive) {
      if (!currentOfflineUser) setLatestSessionByMe(null);
      return;
    }
    const loadLatestSession = async () => {
      const activeUserId = currentOfflineUser.username;
      
      // 1. Try local cache first
      let localLatest: any = null;
      try {
        const localData = localStorage.getItem('local_test_sessions');
        if (localData) {
          const sList = JSON.parse(localData);
          const filtered = sList.filter((s: any) => s.userId === activeUserId);
          if (filtered.length > 0) {
            localLatest = filtered[0];
          }
        }
      } catch (err) {
        console.warn('Error reading local session history:', err);
      }

      // 2. Check session cache for latest cloud session (avoids redundant reads across components)
      const sessionCacheKey = `cached_latest_session_${activeUserId}`;
      try {
        const cachedRaw = sessionStorage.getItem(sessionCacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const ageMs = Date.now() - (cached.timestamp || 0);
          if (ageMs < TEN_MINUTES_MS && cached.data) {
            setLatestSessionByMe({
              ...cached.data,
              timestamp: new Date(cached.data.timestamp)
            });
            return;
          }
        }
      } catch (err) {
        console.warn('Notice reading session cache for latest session:', err);
      }
      
      // 3. Query Supabase only if cache empty and not in active test run
      if (isSupabaseActive && activeUserId !== 'sandbox_guest_uid' && !isTestActive) {
        try {
          const { data, error } = await supabase
            .from('test_sessions')
            .select('*')
            .or(`user_id.eq.${activeUserId},operator_id.eq.${activeUserId}`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (!error && data && data.length > 0) {
            const firstRow = data[0];
            const timestampDate = firstRow.created_at ? new Date(firstRow.created_at) : (firstRow.timestamp ? new Date(firstRow.timestamp) : new Date());
            const avgSec = (firstRow.average_time_ms || firstRow.averageTimeMs || 0) / 1000;
            const category: TrainingCategory = firstRow.category || 'tax_number';
            let computedLvl = firstRow.level || 'D';
            if (!firstRow.level) {
              if (category === 'date_number') {
                if (avgSec <= 2.0) computedLvl = 'A';
                else if (avgSec <= 2.8) computedLvl = 'B';
                else if (avgSec <= 3.6) computedLvl = 'C';
              } else if (category === 'phone_number') {
                if (avgSec <= 2.5) computedLvl = 'A';
                else if (avgSec <= 3.5) computedLvl = 'B';
                else if (avgSec <= 4.5) computedLvl = 'C';
              } else {
                if (avgSec <= 3.0) computedLvl = 'A';
                else if (avgSec <= 4.0) computedLvl = 'B';
                else if (avgSec <= 5.0) computedLvl = 'C';
              }
            }

            const sessionObj = {
              id: firstRow.id,
              userId: firstRow.user_id || firstRow.userId || activeUserId,
              operatorId: firstRow.operator_id || firstRow.operatorId || activeUserId,
              totalImagesAttempted: firstRow.total_attempted ?? firstRow.totalImagesAttempted ?? 20,
              correctEntries: firstRow.correct_entries ?? firstRow.correctEntries ?? 0,
              averageTimeMs: firstRow.average_time_ms ?? firstRow.averageTimeMs ?? 0,
              averageSpeed: firstRow.average_speed ?? firstRow.averageSpeed ?? (avgSec > 0 ? +avgSec.toFixed(2) : 0),
              accuracy: firstRow.accuracy ?? 100,
              level: computedLvl,
              trainingMode: firstRow.training_mode || firstRow.trainingMode || 'easy_20',
              category,
              details: firstRow.details || [],
              timestamp: timestampDate
            };

            setLatestSessionByMe(sessionObj);
            try {
              sessionStorage.setItem(sessionCacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: sessionObj
              }));
            } catch {}
            return;
          }
        } catch (err) {
          console.warn('Notice reading latest session from Supabase:', err);
        }
      }
      
      if (localLatest) {
        const evaluatedAvgSec = localLatest.averageTimeMs / 1000;
        const category: TrainingCategory = localLatest.category || 'tax_number';
        let computedLvl = 'D';
        if (category === 'date_number') {
          if (evaluatedAvgSec <= 2.0) computedLvl = 'A';
          else if (evaluatedAvgSec <= 2.8) computedLvl = 'B';
          else if (evaluatedAvgSec <= 3.6) computedLvl = 'C';
        } else if (category === 'phone_number') {
          if (evaluatedAvgSec <= 2.5) computedLvl = 'A';
          else if (evaluatedAvgSec <= 3.5) computedLvl = 'B';
          else if (evaluatedAvgSec <= 4.5) computedLvl = 'C';
        } else {
          if (evaluatedAvgSec <= 3.0) computedLvl = 'A';
          else if (evaluatedAvgSec <= 4.0) computedLvl = 'B';
          else if (evaluatedAvgSec <= 5.0) computedLvl = 'C';
        }

        setLatestSessionByMe({
          ...localLatest,
          timestamp: new Date(localLatest.timestamp),
          level: computedLvl,
          category
        });
      }
    };
    loadLatestSession();
  }, [currentOfflineUser, refreshTrigger, isTestActive]);

  const fetchSandboxUsers = async (forceRefresh = false) => {
    // Check session cache first
    if (!forceRefresh) {
      try {
        const cachedRaw = sessionStorage.getItem('cached_sandbox_users');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const ageMs = Date.now() - (cached.timestamp || 0);
          if (ageMs < TEN_MINUTES_MS && Array.isArray(cached.data) && cached.data.length > 0) {
            setLocalUsers(cached.data);
            return;
          }
        }
      } catch (err) {
        console.warn('Notice reading cached sandbox users:', err);
      }
    }

    if (isSupabaseActive && !isTestActive) {
      try {
        const { data, error } = await supabase.from('sandbox_users').select('*');
        if (error) {
          throw error;
        }
        
        if (data && data.length > 0) {
          const users = data.map((u: any) => ({
            username: u.username,
            passwordText: u.password_text || u.passwordText || 'guest',
            role: u.role || 'trainee',
            createdAt: u.created_at || u.createdAt || new Date().toISOString().split('T')[0]
          }));
          setLocalUsers(users);
          try {
            sessionStorage.setItem('cached_sandbox_users', JSON.stringify({
              timestamp: Date.now(),
              data: users
            }));
          } catch {}
        } else {
          const defaultUsers = [
            { username: 'admin', passwordText: 'admin', role: 'admin', createdAt: '2026-05-22' },
            { username: 'guest', passwordText: 'guest', role: 'trainee', createdAt: '2026-05-22' }
          ];
          for (const u of defaultUsers) {
            await supabase.from('sandbox_users').upsert({
              username: u.username,
              password_text: u.passwordText,
              role: u.role,
              created_at: u.createdAt
            });
          }
          setLocalUsers(defaultUsers);
          try {
            sessionStorage.setItem('cached_sandbox_users', JSON.stringify({
              timestamp: Date.now(),
              data: defaultUsers
            }));
          } catch {}
        }
      } catch (err) {
        console.warn('Notice loading sandbox users from Supabase:', err);
      }
    }
  };

  const fetchCustomInvoices = async (forceRefresh = false) => {
    // 1. Strict Session Caching: If cached within 10 minutes and not force refreshing, load directly from memory/sessionStorage
    if (!forceRefresh) {
      try {
        const cachedRaw = sessionStorage.getItem('cached_cloud_invoices');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const ageMs = Date.now() - (cached.timestamp || 0);
          if (ageMs < TEN_MINUTES_MS && Array.isArray(cached.data)) {
            if (cached.data.length > 0) {
              setCustomInvoices(cached.data);
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Notice reading cached custom invoices:', err);
      }
    }

    if (forceRefresh) {
      setIsRefreshingInvoices(true);
    }

    // 2. Query Supabase
    if (isSupabaseActive && !isTestActive) {
      try {
        const { data, error } = await supabase.from('custom_invoices').select('*');
        if (error) {
          throw error;
        }

        // Fetch verified training labels to persist full ground truth fidelity across all sessions
        const labelsLookup = new Map<string, any>();
        try {
          const { data: labelsData } = await supabase.from('training_labels').select('*');
          if (labelsData && Array.isArray(labelsData)) {
            labelsData.forEach((row: any) => {
              if (row.image_identifier) {
                const normKey = String(row.image_identifier).replace(/\.[^/.]+$/, '').trim().toLowerCase();
                labelsLookup.set(normKey, row);
              }
            });
          }
        } catch (labelErr) {
          console.warn('Notice loading training_labels in fetchCustomInvoices:', labelErr);
        }

        if (data && Array.isArray(data)) {
          const invoices = data.map((row: any) => {
            const rawTitle = row.company_name || row.id || '';
            const normKey = String(rawTitle).replace(/\.[^/.]+$/, '').trim().toLowerCase();
            const matchedLabel = labelsLookup.get(normKey);

            const expectedTarget = matchedLabel?.target_value || matchedLabel?.expected_value || row.target_value || row.expected_number;
            const targetDigits = matchedLabel?.target_digits
              ? Number(matchedLabel.target_digits)
              : (matchedLabel?.custom_digit_length
                ? Number(matchedLabel.custom_digit_length)
                : (row.target_digits
                  ? Number(row.target_digits)
                  : (row.custom_digit_length ? Number(row.custom_digit_length) : undefined)));

            return {
              id: row.id,
              category: row.category,
              expectedNumber: expectedTarget,
              target_value: expectedTarget,
              target_digits: targetDigits,
              custom_digit_length: targetDigits,
              companyName: matchedLabel?.issuer_or_note || row.company_name,
              invoiceDate: row.invoice_date,
              totalAmount: row.total_amount,
              difficulty: row.difficulty,
              style: row.style,
              customImageUrl: row.custom_image_url
            };
          });
          if (invoices.length > 0) {
            setCustomInvoices(invoices);
            try {
              localStorage.setItem('custom_uploaded_invoices', JSON.stringify(invoices));
            } catch {}
          }
          try {
            sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
              timestamp: Date.now(),
              data: invoices
            }));
          } catch {}
        }
      } catch (err) {
        console.warn('Notice loading custom invoices from Supabase:', err);
      } finally {
        if (forceRefresh) {
          setIsRefreshingInvoices(false);
        }
      }
    } else {
      if (forceRefresh) {
        setIsRefreshingInvoices(false);
      }
    }
  };

  // Initial load on mount
  useEffect(() => {
    fetchSandboxUsers();
    fetchCustomInvoices();
  }, []);

  // Sync state loops to increment active item chronometer clock
  useEffect(() => {
    if (isTestActive) {
      startTimeRef.current = performance.now();
      setElapsedMs(0);

      // Start the display tick updates throttled to 100ms with React.startTransition to never block user input
      timerIntervalRef.current = window.setInterval(() => {
        const delta = performance.now() - startTimeRef.current;
        React.startTransition(() => {
          setElapsedMs(Math.round(delta));
        });
      }, 100) as unknown as number;
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [currentIndex, isTestActive]);

  /**
   * Fisher-Yates algorithm for unbiased random shuffling of cards
   */
  function fisherYatesShuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Starts the official 100-Card Speed Training session strictly using Admin uploaded custom images.
   * Shuffles uploaded images and repeats across the pool to deliver exactly 100 authentic custom cards.
   */
  const startAllInOneTrainingSession = () => {
    setActiveTrainingCategory('all_in_one');
    setTrainingMode('all_in_one_100');
    setCheatTriggerMsg(null);
    setSaveError(null);

    // 1. Gather pool items strictly from authentic custom images uploaded by Admin
    const isRealUploadedInvoice = (i: GeneratedInvoiceData & { customImageUrl?: string }): i is GeneratedInvoiceData & { customImageUrl: string } => {
      if (!i || !i.customImageUrl) return false;
      if (typeof i.id === 'string' && (i.id.startsWith('sample_') || i.id.startsWith('custom_sample_') || i.id.includes('_sample_'))) {
        return false;
      }
      return true;
    };

    const uploadedPool = customInvoices.filter(isRealUploadedInvoice);

    if (uploadedPool.length === 0) {
      setCheatTriggerMsg(
        language === 'my'
          ? 'အက်ဒမင်မှ လေ့ကျင့်ရေးအတွက် အမှန်တကယ် ပြေစာပုံများ မထည့်သွင်းရသေးပါ။ ကျေးဇူးပြု၍ "ပုံမှတ်တမ်း & အချက်အလက်များ" (Card Pools) ကဏ္ဍတွင် ပြေစာပုံများ အရင်တင်ပေးပါ။'
          : 'No custom receipt images uploaded for training pool by Admin yet. Please upload training receipt images in the Card Pools tab to start the 100-card training test.'
      );
      return;
    }

    // 2. Fisher-Yates shuffle the admin uploaded custom images
    const shuffled: (GeneratedInvoiceData & { customImageUrl: string })[] = fisherYatesShuffle(uploadedPool);

    // 3. Select exactly 100 cards strictly from the admin's uploaded custom images
    const deck100: (GeneratedInvoiceData & { customImageUrl?: string; expectedValue?: string })[] = [];
    for (let i = 0; i < 100; i++) {
      const item = shuffled[i % shuffled.length];
      const catLower = String(item.category || 'tax_number').toLowerCase();
      const isDate = catLower === 'date_number' || catLower === 'date';
      const isTax = catLower === 'tax_number' || catLower === 'tax';
      let expNum = item.target_value || item.expectedNumber || '';
      const customLength = item.custom_digit_length || item.target_digits;

      if (customLength && customLength > 0) {
        const rawDigits = (expNum || '').replace(/\D/g, '');
        if (rawDigits.length >= customLength) {
          expNum = rawDigits.slice(0, customLength);
        } else if (rawDigits.length > 0) {
          expNum = rawDigits.padEnd(customLength, '0');
        } else {
          expNum = ''.padStart(customLength, '0');
        }
      } else if (isDate) {
        const rawDigits = (expNum || '').replace(/\D/g, '');
        if (rawDigits.length >= 8) {
          expNum = rawDigits.slice(0, 8);
        } else {
          expNum = generateRandomDateNumber();
        }
      } else if (isTax) {
        const rawDigits = (expNum || '').replace(/\D/g, '');
        if (rawDigits.length > 0) {
          expNum = rawDigits;
        } else {
          expNum = rawDigits.slice(-13).padStart(13, '0');
        }
      }

      const cardDigits = customLength || (expNum ? expNum.replace(/\D/g, '').length : 13);
      deck100.push({
        ...item,
        expectedNumber: expNum,
        expectedValue: expNum,
        target_value: expNum,
        target_digits: cardDigits,
        custom_digit_length: cardDigits,
        id: `card_${i + 1}_${item.id}_${Math.random().toString(36).substring(2, 6)}`
      });
    }

    setExpectedDataset(deck100);

    // Map of image URLs strictly from the uploaded custom images
    const urls: Record<string, string> = {};
    deck100.forEach(item => {
      urls[item.id] = item.customImageUrl || '';
    });
    setImageUrls(urls);

    setSessionResults([]);
    setMistakesList([]);
    setMistakesCount(0);
    setCorrectCount(0);
    setAverageTimeMs(0);
    setSessionTotalTimeMs(0);
    setCurrentIndex(0);
    setTestComplete(false);
    setIsConfirmingCancel(false);
    setShowErrorReview(false);
    setLatestEvaluation(null);
    setIsTestActive(true);

    // Preload next image
    if (deck100.length > 1) {
      const preloadImg = new Image();
      preloadImg.src = urls[deck100[1].id];
    }
  };

  /**
   * Training tests run via 100-card session based on Admin uploaded custom images.
   */
  const startCategoryTestingSession = (_category?: TrainingCategory, _mode: TrainingMode = 'all_in_one_100') => {
    startAllInOneTrainingSession();
  };

  /**
   * Repeats the speed testing session. Defaults to All-In-One 100-Card session.
   */
  const handleRunAgain = () => {
    if (activeTrainingCategory === 'all_in_one' || trainingMode === 'all_in_one_100') {
      startAllInOneTrainingSession();
    } else {
      startCategoryTestingSession(activeTrainingCategory, trainingMode);
    }
  };

  // Global accessible keyboard shortcuts (Enter to submit/restart, Esc to restart/abort/dismiss modals)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape key behavior
      if (e.key === 'Escape') {
        if (labelingModalIndex !== null) {
          e.preventDefault();
          setLabelingModalIndex(null);
          return;
        }
        if (showErrorReview) {
          e.preventDefault();
          setShowErrorReview(false);
          return;
        }
        if (isTestActive) {
          e.preventDefault();
          if (isConfirmingCancel) {
            setIsConfirmingCancel(false);
          } else {
            setIsConfirmingCancel(true);
          }
          return;
        }
        if (testComplete) {
          e.preventDefault();
          setTestComplete(false);
          setIsTestActive(false);
          return;
        }
      }

      // Enter key behavior on results screen to restart test
      if (e.key === 'Enter') {
        if (testComplete && !isTestActive) {
          const target = e.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) return;
          e.preventDefault();
          handleRunAgain();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [labelingModalIndex, showErrorReview, isTestActive, isConfirmingCancel, testComplete, activeTrainingCategory, trainingMode]);

  /**
   * Emergency abort to cancel the active testing session and return to dashboard.
   */
  const handleCancelTestingSession = () => {
    setIsTestActive(false);
    setTestComplete(false);
    setCurrentIndex(0);
    setSessionResults([]);
    setCorrectCount(0);
    setAverageTimeMs(0);
    setIsConfirmingCancel(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  /**
   * Reads user uploaded invoice images and adds them to the testing pool under the target category.
   * Auto-extracts category-specific codes from filenames (13-digit tax, 8-digit date, 10-11-digit phone).
   */
  const handleCustomImagesUpload = async (files: FileList | File[], category: TrainingCategory = activeTrainingCategory) => {
    setUploadProgressError(null);
    const fileArray = Array.from(files);
    
    if (fileArray.length === 0) return;

    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setUploadProgressError('Invalid file format. Please upload standard image files (PNG/JPG/WEBP).');
      return;
    }

    const newItems: (GeneratedInvoiceData & { customImageUrl: string })[] = [];

    const readPromises = imageFiles.map(async (file, idx) => {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `invoices/${Date.now()}_${idx}_${cleanFileName}`;

      let publicUrl = '';
      try {
        const { data, error } = await supabase.storage
          .from('invoices')
          .upload(filePath, file, { upsert: true });

        if (!error && data) {
          const { data: { publicUrl: extractedUrl } } = supabase.storage
            .from('invoices')
            .getPublicUrl(filePath);
          if (extractedUrl) {
            publicUrl = extractedUrl;
          }
        }
      } catch (storageErr) {
        console.warn('Notice during Supabase Storage upload in handleCustomImagesUpload:', storageErr);
      }

      if (!publicUrl) {
        publicUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      }

      const customId = `cust_${category}_${Date.now().toString().slice(-4)}_${idx}_${Math.floor(Math.random() * 1000)}`;

      let expected = '';
      if (category === 'tax_number') {
        const tMatch = file.name.match(/T\d{13}/i);
        if (tMatch) {
          expected = tMatch[0].toUpperCase();
        } else {
          const digitMatch = file.name.match(/\d{13}/);
          if (digitMatch) {
            expected = `T${digitMatch[0]}`;
          }
        }
        if (!expected) expected = customExpectedCode.trim().toUpperCase();
        if (!expected) expected = generateRandomInvoiceNumber();
      } else if (category === 'date_number') {
        const dateMatch = file.name.match(/20\d{6}/) || file.name.match(/\d{8}/);
        if (dateMatch) {
          expected = dateMatch[0];
        }
        if (!expected) expected = customExpectedCode.trim().replace(/\D/g, '');
        if (!expected || expected.length !== 8) expected = generateRandomDateNumber();
      } else if (category === 'phone_number') {
        const phoneMatch = file.name.match(/0\d{9,10}/) || file.name.match(/\d{10,11}/);
        if (phoneMatch) {
          expected = phoneMatch[0];
        }
        if (!expected) expected = customExpectedCode.trim().replace(/\D/g, '');
        if (!expected || (expected.length !== 10 && expected.length !== 11)) expected = generateRandomPhoneNumber();
      }

      let company = customCompanyName.trim();
      if (!company) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        company = nameWithoutExt.substring(0, 24);
      }

      const targetDigits = expected.replace(/\D/g, '').length || 13;

      const newItem: GeneratedInvoiceData & { customImageUrl: string } = {
        id: customId,
        category,
        expectedNumber: expected,
        target_value: expected,
        target_digits: targetDigits,
        custom_digit_length: targetDigits,
        companyName: company || `Custom Upload ${idx + 1}`,
        invoiceDate: new Date().toLocaleDateString('ja-JP'),
        totalAmount: `${(2000 + Math.floor(Math.random() * 8000)).toLocaleString()}円`,
        difficulty: 'medium',
        style: 'modern',
        customImageUrl: publicUrl
      };

      newItems.push(newItem);
    });

    await Promise.all(readPromises);

    if (newItems.length === 0) {
      setUploadProgressError('Could not process images. Ensure files are under 3MB.');
      return;
    }

    const updated = [...customInvoices, ...newItems];
    setCustomInvoices(updated);

    try {
      localStorage.setItem('custom_uploaded_invoices', JSON.stringify(updated));
    } catch (err) {
      console.warn('LocalStorage quota exceeded:', err);
    }
    try {
      sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
        timestamp: Date.now(),
        data: updated
      }));
    } catch {}

    if (isSupabaseActive) {
      try {
        const invoicePayloads = newItems.map(item => ({
          id: item.id,
          category: item.category,
          image_url: item.customImageUrl,
          custom_image_url: item.customImageUrl,
          expected_number: item.expectedNumber,
          target_value: item.target_value || item.expectedNumber,
          target_digit_length: (item.target_value || item.expectedNumber || '').replace(/\D/g, '').length || 13,
          target_digits: item.target_digits || 13,
          custom_digit_length: item.custom_digit_length || 13,
          issuer_name: item.companyName,
          company_name: item.companyName,
          invoice_date: item.invoiceDate,
          total_amount: item.totalAmount,
          difficulty: item.difficulty,
          style: item.style
        }));
        await supabase.from('custom_invoices').upsert(invoicePayloads);
      } catch (err) {
        console.warn('Failed to sync uploaded invoices to Supabase database:', err);
      }
    }

    setCustomExpectedCode('');
    setCustomCompanyName('');
  };

  /**
   * Generates a realistic sample invoice in-memory for the target category
   */
  const handleAddSampleToCustomList = async (category: TrainingCategory = activeTrainingCategory) => {
    const categoryCount = customInvoices.filter(i => (i.category || 'tax_number') === category).length + 1;
    const { generateSampleCustomInvoice } = await import('./utils/receiptGenerator');
    const newCustom = generateSampleCustomInvoice(category, categoryCount);
    
    const updated = [...customInvoices, newCustom];
    setCustomInvoices(updated);
    localStorage.setItem('custom_uploaded_invoices', JSON.stringify(updated));
    try {
      sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
        timestamp: Date.now(),
        data: updated
      }));
    } catch {}

    if (isSupabaseActive) {
      try {
        const item = newCustom;
        await supabase.from('custom_invoices').upsert({
          id: item.id,
          category: item.category,
          expected_number: item.expectedNumber,
          company_name: item.companyName,
          invoice_date: item.invoiceDate,
          total_amount: item.totalAmount,
          difficulty: item.difficulty,
          style: item.style,
          custom_image_url: item.customImageUrl
        });
      } catch (err) {
        console.warn('Failed to sync sample invoice to Supabase database:', err);
      }
    }
  };

  /**
   * Clears all custom invoices in a specific category
   */
  const handleClearCategoryPool = async (category: TrainingCategory) => {
    const updated = customInvoices.filter(item => (item.category || 'tax_number') !== category);
    setCustomInvoices(updated);
    localStorage.setItem('custom_uploaded_invoices', JSON.stringify(updated));
    try {
      sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
        timestamp: Date.now(),
        data: updated
      }));
    } catch {}

    if (isSupabaseActive) {
      try {
        await supabase.from('custom_invoices').delete().eq('category', category);
      } catch (err) {
        console.warn('Failed to clear custom invoices from Supabase:', err);
      }
    }
  };

  /**
   * Removes a single invoice from the custom pool
   */
  const handleDeleteCustomInvoice = async (id: string) => {
    const updated = customInvoices.filter(item => item.id !== id);
    setCustomInvoices(updated);
    localStorage.setItem('custom_uploaded_invoices', JSON.stringify(updated));
    try {
      sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
        timestamp: Date.now(),
        data: updated
      }));
    } catch {}

    if (isSupabaseActive) {
      try {
        await supabase.from('custom_invoices').delete().eq('id', id);
      } catch (err) {
        console.warn('Failed to delete custom invoice from Supabase:', err);
      }
    }
  };

  /**
   * Updates expected transcribed code for a custom invoice
   */
  const updateCustomInvoiceCode = async (id: string, newCode: string, targetDigits?: number) => {
    const formattedCode = newCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const calculatedDigits = targetDigits !== undefined && targetDigits > 0
      ? targetDigits
      : (formattedCode.replace(/\D/g, '').length || 13);

    const updated = customInvoices.map(inv => {
      if (inv.id === id) {
        return { 
          ...inv, 
          expectedNumber: formattedCode,
          target_value: formattedCode,
          target_digits: calculatedDigits,
          custom_digit_length: calculatedDigits
        };
      }
      return inv;
    });
    setCustomInvoices(updated);
    try {
      localStorage.setItem('custom_uploaded_invoices', JSON.stringify(updated));
    } catch {}
    try {
      sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
        timestamp: Date.now(),
        data: updated
      }));
    } catch {}

    const matched = updated.find(inv => inv.id === id);
    if (isSupabaseActive && matched) {
      try {
        await supabase.from('custom_invoices').upsert({
          id: matched.id,
          expected_number: matched.expectedNumber,
          target_value: matched.target_value || matched.expectedNumber,
          target_digits: matched.target_digits ?? calculatedDigits,
          custom_digit_length: matched.custom_digit_length ?? calculatedDigits,
          company_name: matched.companyName,
          invoice_date: matched.invoiceDate || '',
          total_amount: matched.totalAmount || '',
          difficulty: matched.difficulty || 'medium',
          style: matched.style || 'modern',
          custom_image_url: matched.customImageUrl,
          category: matched.category || 'tax_number'
        });
      } catch (err) {
        console.warn('Failed to update expected number in Supabase:', err);
      }
    }
  };

  /**
   * Updates company name for a custom invoice
   */
  const updateCustomInvoiceCompany = async (id: string, newCompany: string) => {
    const updated = customInvoices.map(inv => {
      if (inv.id === id) {
        return { ...inv, companyName: newCompany };
      }
      return inv;
    });
    setCustomInvoices(updated);
    try {
      localStorage.setItem('custom_uploaded_invoices', JSON.stringify(updated));
    } catch {}
    try {
      sessionStorage.setItem('cached_cloud_invoices', JSON.stringify({
        timestamp: Date.now(),
        data: updated
      }));
    } catch {}

    const matched = updated.find(inv => inv.id === id);
    if (isSupabaseActive && matched) {
      try {
        await supabase.from('custom_invoices').upsert({
          id: matched.id,
          expected_number: matched.expectedNumber,
          company_name: matched.companyName,
          invoice_date: matched.invoiceDate || '',
          total_amount: matched.totalAmount || '',
          difficulty: matched.difficulty || 'medium',
          style: matched.style || 'modern',
          custom_image_url: matched.customImageUrl,
          category: matched.category || 'tax_number'
        });
      } catch (err) {
        console.warn('Failed to update company name in Supabase:', err);
      }
    }
  };

  /**
   * Image fully loaded callback in InvoiceViewer
   */
  const handleInvoiceImageOnLoad = () => {
    startTimeRef.current = performance.now();
  };


  /**
   * Evaluates speed capture and writes entry metrics, then advances to next invoice.
   * Tracks strict mistake rule (>2 errors = Disqualified/Fail).
   */
  const verifyAndAdvanceSession = (
    typedText: string, 
    category: TrainingCategory,
    providedDurationMs?: number,
    _metrics?: TypingCardMetrics
  ) => {
    const endTimestamp = performance.now();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const durationMs = providedDurationMs ?? Math.round(endTimestamp - startTimeRef.current);
    const currentInvoice = expectedDataset[currentIndex];
    const currentCard = currentInvoice;
    if (!currentCard.target_value) {
      currentCard.target_value = (currentCard as any).expectedValue || currentCard.expectedNumber || '';
    }

    // Sanitize values for dynamic digit comparison
    const expDigits = currentCard.target_value.replace(/\D/g, '');
    const typDigits = typedText.replace(/\D/g, '');
    const isCorrect = (expDigits === typDigits);

    const resultEntry: TypingDetail = {
      imageId: currentInvoice.id,
      expectedNumber: currentInvoice.expectedNumber,
      typedNumber: typedText.toUpperCase(),
      timeSpentMs: durationMs,
      isCorrect,
      category
    };

    const nextResults = [...sessionResults, resultEntry];
    setSessionResults(nextResults);

    let nextCorrectCount = correctCount;
    let nextMistakesCount = mistakesCount;

    if (isCorrect) {
      nextCorrectCount += 1;
      setCorrectCount(nextCorrectCount);
    } else {
      nextMistakesCount += 1;
      setMistakesCount(nextMistakesCount);
      setMistakesList(prev => [...prev, {
        cardIndex: currentIndex + 1,
        imageId: currentInvoice.id,
        category,
        expectedNumber: currentInvoice.expectedNumber,
        typedNumber: typedText,
        timeSpentMs: durationMs
      }]);
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= expectedDataset.length) {
      finalizeSessionLog(nextResults, nextCorrectCount, nextMistakesCount, category);
    } else {
      setCurrentIndex(nextIndex);
      if (nextIndex + 1 < expectedDataset.length) {
        const nextInvId = expectedDataset[nextIndex + 1].id;
        const nextDataUri = imageUrls[nextInvId];
        if (nextDataUri) {
          const img = new Image();
          img.src = nextDataUri;
        }
      }
    }
  };

  /**
   * Finalizes score aggregation, evaluates SLA ranking, and persists payload to 
   * Supabase `training_sessions` table (and local storage).
   */
  const finalizeSessionLog = async (
    completedResults: TypingDetail[], 
    finalCorrect: number, 
    finalMistakes: number, 
    category: TrainingCategory
  ) => {
    setIsTestActive(false);
    setTestComplete(true);

    const totalMs = completedResults.reduce((acc, curr) => acc + curr.timeSpentMs, 0);
    const avgMs = completedResults.length > 0 ? Math.round(totalMs / completedResults.length) : 0;
    setAverageTimeMs(avgMs);
    setSessionTotalTimeMs(totalMs);

    // Calculate official evaluation via evaluateAllInOneSession
    const evaluation = evaluateAllInOneSession(avgMs, finalMistakes);
    setLatestEvaluation(evaluation);

    setIsSaving(true);
    setSaveError(null);

    const activeUserId = currentOfflineUser ? currentOfflineUser.username : 'guest';
    const accuracyPercent = completedResults.length > 0 ? Math.round((finalCorrect / completedResults.length) * 100) : 100;
    const avgSpeedSec = +(avgMs / 1000).toFixed(2);
    const now = new Date();
    const newSessionDocId = `session_${now.getTime()}`;

    const rawPayload = {
      id: newSessionDocId,
      userId: activeUserId,
      operatorId: activeUserId,
      totalImagesAttempted: completedResults.length,
      totalCards: completedResults.length,
      correctEntries: finalCorrect,
      mistakesCount: finalMistakes,
      isPassed: evaluation.isPassed,
      status: evaluation.status,
      averageTimeMs: avgMs,
      averageSpeed: avgSpeedSec,
      totalTimeMs: totalMs,
      accuracy: accuracyPercent,
      level: evaluation.level,
      trainingMode: trainingMode,
      category: category,
      details: completedResults.map(r => ({
        imageId: r.imageId,
        expectedNumber: r.expectedNumber,
        typedNumber: r.typedNumber,
        timeSpentMs: r.timeSpentMs,
        isCorrect: r.isCorrect,
        category: r.category || category
      }))
    };

    // 1. Write to local storage (both training_sessions and test_sessions cache)
    try {
      const localAio = localStorage.getItem('local_training_sessions');
      const prevAio = localAio ? JSON.parse(localAio) : [];
      localStorage.setItem('local_training_sessions', JSON.stringify([{ ...rawPayload, timestamp: now.toISOString() }, ...prevAio]));

      const localData = localStorage.getItem('local_test_sessions');
      const prevList = localData ? JSON.parse(localData) : [];
      const localLogEntry = {
        ...rawPayload,
        timestamp: now.toISOString()
      };
      localStorage.setItem('local_test_sessions', JSON.stringify([localLogEntry, ...prevList]));
    } catch (err) {
      console.error('Failed writing locally:', err);
    }

    // 2. Upload to Supabase training_sessions table
    if (isSupabaseActive && currentOfflineUser && activeUserId !== 'sandbox_guest_uid') {
      try {
        await supabase.from('training_sessions').insert([{
          id: newSessionDocId,
          user_id: activeUserId,
          operator_id: activeUserId,
          session_type: 'all_in_one',
          training_mode: trainingMode,
          category: category,
          total_cards: completedResults.length,
          total_attempted: completedResults.length,
          correct_entries: finalCorrect,
          mistakes_count: finalMistakes,
          is_passed: evaluation.isPassed,
          status: evaluation.status,
          average_speed: avgSpeedSec,
          average_time_ms: avgMs,
          total_time_ms: totalMs,
          speed_rank: evaluation.level,
          level: evaluation.level,
          accuracy: accuracyPercent,
          details: completedResults,
          created_at: now.toISOString()
        }]);
      } catch (err) {
        console.warn('Notice saving session to training_sessions table:', err);
      }

      // Also persist to test_sessions table for backward compatibility
      try {
        await supabase.from('test_sessions').insert([{
          id: newSessionDocId,
          user_id: activeUserId,
          operator_id: activeUserId,
          category: category,
          training_mode: trainingMode,
          total_attempted: completedResults.length,
          correct_entries: finalCorrect,
          average_time_ms: avgMs,
          average_speed: avgSpeedSec,
          accuracy: accuracyPercent,
          level: evaluation.level,
          details: completedResults
        }]);
      } catch (err) {
        console.warn('Notice saving test session to Supabase:', err);
        setSaveError('Cloud sync notice: Result safely saved in local offline history.');
      }
    }

    const completedSessionObj = {
      id: newSessionDocId,
      ...rawPayload,
      timestamp: now,
      level: evaluation.level,
      category
    };
    setLatestSessionByMe(completedSessionObj);
    try {
      sessionStorage.setItem(`cached_latest_session_${activeUserId}`, JSON.stringify({
        timestamp: Date.now(),
        data: completedSessionObj
      }));
    } catch {}

    setIsSaving(false);
    setRefreshTrigger(prev => prev + 1);
  };

  /**
   * Anti-Cheating guards
   */
  const handlePastePrevent = (e: React.ClipboardEvent) => {
    e.preventDefault();
    setCheatTriggerMsg('Clipboard paste access is strictly security-blocked during testing.');
    setTimeout(() => setCheatTriggerMsg(null), 4000);
  };

  const handleCopyPrevent = (e: React.ClipboardEvent) => {
    e.preventDefault();
    setCheatTriggerMsg('Text copy actions are disabled to prevent credential extraction.');
    setTimeout(() => setCheatTriggerMsg(null), 4000);
  };

  // Determine typing tier dynamically by category
  const evaluateRank = () => {
    return getCategoryRankDetails(averageTimeMs, activeTrainingCategory);
  };

  const currentRank = evaluateRank();

  const handleDownloadPDF = async () => {
    const rankDetails = getCategoryRankDetails(averageTimeMs, activeTrainingCategory);

    const testSessionPayload: TestSession = {
      userId: currentOfflineUser ? currentOfflineUser.username : 'guest',
      operatorId: currentOfflineUser ? currentOfflineUser.username : 'guest',
      timestamp: new Date(),
      totalImagesAttempted: expectedDataset.length,
      correctEntries: correctCount,
      averageTimeMs: averageTimeMs,
      averageSpeed: +(averageTimeMs / 1000).toFixed(2),
      accuracy: expectedDataset.length > 0 ? Math.round((correctCount / expectedDataset.length) * 100) : 100,
      level: rankDetails.level,
      trainingMode: trainingMode,
      category: activeTrainingCategory,
      details: sessionResults
    };

    const { generateCertificatePDF } = await import('./utils/pdfGenerator');
    await generateCertificatePDF(testSessionPayload, rankDetails.level, rankDetails.name);
  };

  const handleDownloadHTML = async () => {
    const rankDetails = getCategoryRankDetails(averageTimeMs, activeTrainingCategory);

    const testSessionPayload: TestSession = {
      userId: currentOfflineUser ? currentOfflineUser.username : 'guest',
      operatorId: currentOfflineUser ? currentOfflineUser.username : 'guest',
      timestamp: new Date(),
      totalImagesAttempted: expectedDataset.length,
      correctEntries: correctCount,
      averageTimeMs: averageTimeMs,
      averageSpeed: +(averageTimeMs / 1000).toFixed(2),
      accuracy: expectedDataset.length > 0 ? Math.round((correctCount / expectedDataset.length) * 100) : 100,
      level: rankDetails.level,
      trainingMode: trainingMode,
      category: activeTrainingCategory,
      details: sessionResults
    };

    const { generateCertificateHTML } = await import('./utils/htmlGenerator');
    generateCertificateHTML(testSessionPayload, rankDetails.level, rankDetails.name);
  };

  // If user is not authenticated locally, show Login Screen
  if (!currentOfflineUser) {
    return (
      <Suspense fallback={<LoginScreenSkeleton />}>
        <LoginScreen 
          onLogin={handleOfflineLogin}
          localUsers={localUsers}
        />
      </Suspense>
    );
  }

  // Active Category SLA target & label helpers
  const categorySlaTarget = CATEGORY_SLA_CONFIG[activeTrainingCategory]?.levels.C.maxMs || 3700;
  const categorySlaLimitSec = (categorySlaTarget / 1000).toFixed(1);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800 font-sans" id="speedtest-root">
      {/* 1. Global Navigation Bar */}
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 sm:px-6 border-b border-slate-800 sticky top-0 z-30 shrink-0 select-none">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="bg-indigo-500 w-8 h-8 rounded flex items-center justify-center font-bold text-sm text-white shadow-lg shrink-0">DT</div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-semibold tracking-wide truncate">
              {t.appTitle}
            </h1>
            <p className="text-[10px] text-slate-400 hidden sm:block truncate">
              {t.appTagline}
            </p>
          </div>
        </div>
        
        {/* Auth status & Connection indicator & Language Switcher */}
        <div className="flex items-center gap-2 sm:gap-4 md:gap-5 text-xs shrink-0" id="authentication-widget">
          {/* Minimalist Language Switcher Icon Button */}
          <LanguageSwitcher />

          <div className="w-px h-7 bg-slate-700 hidden sm:block"></div>

          <div className="hidden sm:flex flex-col items-end leading-none">
            <span className="text-slate-400 uppercase tracking-tighter text-[9px] font-bold">{t.operatorProfile}</span>
            <span className="font-bold text-indigo-400 mt-1 flex items-center gap-1.5">
              {currentOfflineUser.username} 
              <span className="text-[8px] font-mono bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded uppercase border border-indigo-500/30">
                {currentOfflineUser.role === 'admin' ? t.adminBadge : currentOfflineUser.role}
              </span>
            </span>
          </div>

          <div className="w-px h-7 bg-slate-700 hidden md:block"></div>

          <div className="hidden md:flex flex-col items-end leading-none">
            <span className="text-slate-400 uppercase tracking-tighter text-[9px] font-bold">{t.systemStatus}</span>
            <span className={`font-medium mt-1 flex items-center gap-1 font-mono text-[11px] ${isSupabaseActive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isSupabaseActive ? t.supabaseOnline : t.offlineLocal}
            </span>
          </div>

          <div className="w-px h-7 bg-slate-700"></div>

          <button
            onClick={handleOfflineLogout}
            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition text-[11px] font-bold uppercase cursor-pointer shadow-sm flex items-center gap-1"
            title={t.logout}
            id="logout-button"
            aria-label={t.logout}
          >
            <LogOut className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">{t.logout}</span>
          </button>
        </div>
      </header>

      {/* 2. Main Workstation Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Anti-paste Warning Overlay Card */}
        {cheatTriggerMsg && (
          <div className="bg-rose-950/40 text-rose-300 border border-rose-900/50 rounded-xl p-4 flex items-center space-x-3 animate-bounce">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wide">Security Restriction Active</h4>
              <p className="text-xs mt-0.5">{cheatTriggerMsg}</p>
            </div>
          </div>
        )}

        {/* A. Benchmark configuration start panel */}
        {!isTestActive && !testComplete && (
          <div className="w-full" id="setup-panel">
            {/* Guide & Category Workspace */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-sm animate-fade-in">
              <div className="space-y-6">
                {/* Dynamic Configuration Navigation Tabs (Unified All-In-One + Admin Manager) */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 font-sans mb-4" role="tablist" aria-label="Workstation setup categories">
                  <button
                    onClick={() => { setActiveSetupTab('all_in_one'); setUploadProgressError(null); }}
                    role="tab"
                    aria-selected={activeSetupTab === 'all_in_one'}
                    aria-label={t.allInOneSpeedTraining}
                    className={`pb-3 px-1 sm:px-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition flex items-center gap-1.5 shrink-0 ${
                      activeSetupTab === 'all_in_one'
                        ? 'border-indigo-600 text-indigo-600 font-extrabold'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
                    <span>{t.allInOneSpeedTraining}</span>
                  </button>

                  {currentOfflineUser?.role === 'admin' && (
                    <>
                      <button
                        onClick={() => { setActiveSetupTab('users'); setUploadProgressError(null); }}
                        role="tab"
                        aria-selected={activeSetupTab === 'users'}
                        aria-label={t.traineeUserAccounts}
                        className={`pb-3 px-1 sm:px-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition flex items-center gap-1.5 shrink-0 ${
                          activeSetupTab === 'users'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{t.traineeUserAccounts}</span>
                        <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">{t.adminBadge}</span>
                      </button>

                      <button
                        onClick={() => { setActiveSetupTab('catalog'); setUploadProgressError(null); }}
                        role="tab"
                        aria-selected={activeSetupTab === 'catalog'}
                        aria-label={t.categoryImageCatalog}
                        className={`pb-3 px-1 sm:px-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition flex items-center gap-1.5 shrink-0 ${
                          activeSetupTab === 'catalog'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{t.categoryImageCatalog}</span>
                        <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">{t.adminBadge}</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Tab 1: Unified All-In-One Speed Training View */}
                {activeSetupTab === 'all_in_one' && (
                  <div className="space-y-6 animate-fade-in" id="all-in-one-training-view">
                    {/* Hero Launch Card */}
                    <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-2xl p-6 sm:p-7 border border-indigo-500/30 shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 select-none pointer-events-none opacity-5 text-indigo-400">
                        <Zap className="w-72 h-72" />
                      </div>

                      <div className="relative z-10 space-y-5">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div className="space-y-1.5 max-w-xl">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              <span>{t.heroBadge}</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                              {t.heroTitle}
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                              {t.heroDescription}
                            </p>
                          </div>

                          {/* Action Buttons in Hero Card: Small, elegant, non-overflowing buttons */}
                          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                            {currentOfflineUser?.role === 'admin' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setActiveSetupTab('catalog')}
                                  id="btn-upload-manage-images"
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/40"
                                  title={t.uploadAndManageImagesBtn}
                                >
                                  <ImagePlus className="w-4 h-4 text-emerald-100 shrink-0" />
                                  <span>{t.uploadAndManageImagesBtn}</span>
                                </button>

                                {customInvoices.filter(i => !!i.customImageUrl && !String(i.id).startsWith('sample_')).length > 0 && (
                                  <button
                                    onClick={startAllInOneTrainingSession}
                                    id="btn-start-all-in-one"
                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer border border-indigo-400/40"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-white shrink-0" />
                                    <span>{t.heroStartBtn}</span>
                                  </button>
                                )}
                              </>
                            ) : (
                              <button
                                onClick={startAllInOneTrainingSession}
                                id="btn-start-all-in-one"
                                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold text-xs sm:text-sm tracking-wide shadow-md hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 border border-emerald-300/40"
                              >
                                <Play className="w-4 h-4 fill-white shrink-0" />
                                <span>{t.heroStartBtn}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Pool Status: 100% Based on Uploaded Custom Images */}
                        <div className="pt-3.5 border-t border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300 font-sans text-xs flex items-center gap-1.5">
                              📸 {language === 'my' ? 'အက်ဒမင် တင်သွင်းထားသော ပုံများ:' : 'Admin Uploaded Training Images:'}
                            </span>
                            <span className="text-emerald-400 font-bold font-mono text-sm bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-0.5 rounded-lg">
                              {customInvoices.filter(i => !!i.customImageUrl && !String(i.id).startsWith('sample_')).length} {language === 'my' ? 'ပုံ' : 'images'}
                            </span>
                            <span className="text-[10px] text-indigo-300/80 font-sans hidden md:inline">
                              (100-Card test strictly uses Admin uploaded images)
                            </span>
                          </div>

                          {currentOfflineUser?.role === 'admin' && (
                            <button
                              type="button"
                              onClick={() => setActiveSetupTab('catalog')}
                              className="text-[11px] text-indigo-300 hover:text-white underline cursor-pointer font-sans self-start sm:self-auto font-medium"
                            >
                              {language === 'my' 
                                ? 'ပုံများ စီမံခန့်ခွဲမှု ဇယားသို့ သွားမည် (Manage Catalog) ➜' 
                                : 'Go to Image Catalog ➜'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Operational Criteria & Standards Matrix */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Strict Accuracy Rule Card */}
                      <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4.5 space-y-2">
                        <div className="flex items-center gap-2 text-rose-800 font-extrabold text-xs uppercase tracking-wider">
                          <ShieldAlert className="w-4 h-4 text-rose-600" />
                          <span>{t.accuracyRuleTitle}</span>
                        </div>
                        <p className="text-xs text-rose-900 leading-relaxed font-sans">
                          {t.accuracyRuleDesc}
                        </p>
                        <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-rose-700">
                          <span className="bg-white px-2 py-0.5 rounded border border-rose-200 font-bold">{t.badgeEligible}</span>
                          <span className="bg-rose-200/60 px-2 py-0.5 rounded font-bold text-rose-800">{t.badgeFail}</span>
                        </div>
                      </div>

                      {/* Speed Ranking Tier Card */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-2">
                        <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs uppercase tracking-wider">
                          <Trophy className="w-4 h-4 text-indigo-600" />
                          <span>{t.speedRankingTitle}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="bg-white p-2 rounded-lg border border-emerald-200 text-emerald-800">
                            <strong className="block text-emerald-700">Level A: ≤ 2.3s</strong>
                            <span className="text-[10px] text-slate-500 font-sans">{t.eliteExpertPace}</span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-indigo-200 text-indigo-800">
                            <strong className="block text-indigo-700">Level B: 2.4s ~ 2.5s</strong>
                            <span className="text-[10px] text-slate-500 font-sans">{t.specialistPace}</span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-amber-200 text-amber-800">
                            <strong className="block text-amber-700">Level C: 2.6s ~ 3.0s</strong>
                            <span className="text-[10px] text-slate-500 font-sans">{t.qualifiedStandard}</span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-blue-200 text-blue-800">
                            <strong className="block text-blue-700">Level D: 3.0s ~ 3.2s</strong>
                            <span className="text-[10px] text-slate-500 font-sans">{t.practitionerPace}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Unlimited Attempts & Concurrency Banner */}
                    <div className="bg-slate-900 text-slate-200 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                      <div className="flex items-center gap-2 text-indigo-300">
                        <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span><strong>{t.unlimitedAttemptsBannerTitle}</strong> {t.unlimitedAttemptsBannerDesc}</span>
                      </div>
                      <button
                        onClick={startAllInOneTrainingSession}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs uppercase tracking-wider cursor-pointer transition shrink-0"
                      >
                        {t.launch100CardRunBtn}
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab 2: Admin Card Pools & Sandbox Manager */}
                {activeSetupTab === 'catalog' && currentOfflineUser?.role === 'admin' && (
                  <div className="space-y-4 animate-fade-in" id="admin-pool-catalog-tab">
                    <div className="space-y-1">
                      <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                        🗂️ Card Pools & Sandbox Manager
                      </h2>
                      <p className="text-slate-500 text-xs">
                        Administrator access: Upload custom receipts, export/restore ZIP backups, download CSV templates, or edit label ground truth.
                      </p>
                    </div>

                    <Suspense fallback={<CategorySandboxSkeleton />}>
                      <CategorySandbox
                        category="tax_number"
                        invoices={customInvoices}
                        allInvoices={customInvoices}
                        onUploadImages={handleCustomImagesUpload}
                        onDeleteInvoice={handleDeleteCustomInvoice}
                        onUpdateCode={updateCustomInvoiceCode}
                        onUpdateCompany={updateCustomInvoiceCompany}
                        onClearPool={handleClearCategoryPool}
                        onOpenLabelingModal={(idx) => setLabelingModalIndex(idx)}
                        onStart100CardTest={startAllInOneTrainingSession}
                        uploadProgressError={uploadProgressError}
                        customExpectedCode={customExpectedCode}
                        setCustomExpectedCode={setCustomExpectedCode}
                        customCompanyName={customCompanyName}
                        setCustomCompanyName={setCustomCompanyName}
                        isAdmin={currentOfflineUser?.role === 'admin'}
                        userRole={currentOfflineUser?.role || 'trainee'}
                        onRefreshPool={() => fetchCustomInvoices(true)}
                        isRefreshingPool={isRefreshingInvoices}
                      />
                    </Suspense>
                  </div>
                )}

                {/* Tab 3: Trainee Accounts Management Tab (Admin Only) */}
                {activeSetupTab === 'users' && currentOfflineUser?.role === 'admin' && (
                  <div className="space-y-6 animate-fade-in" id="admin-user-management-tab">
                    <div className="space-y-1">
                      <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                        👥 Trainee Operator Account Manager
                      </h2>
                      <p className="text-slate-500 text-xs">
                        Create individual or batch accounts for classroom operators and view active credentials directory.
                      </p>
                    </div>

                    <div className="flex border-b border-slate-200">
                      <button
                        type="button"
                        onClick={() => { setOperatorInputMode('single'); setUserCreationError(null); setUserCreationSuccess(null); }}
                        className={`pb-2.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition ${
                          operatorInputMode === 'single'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        Single Account Creation
                      </button>
                      <button
                        type="button"
                        onClick={() => { setOperatorInputMode('bulk'); setUserCreationError(null); setUserCreationSuccess(null); }}
                        className={`pb-2.5 px-3 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition flex items-center gap-1 ${
                          operatorInputMode === 'bulk'
                            ? 'border-indigo-600 text-indigo-600 font-extrabold'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <span>⚡ Batch Operator Provisioning</span>
                      </button>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-inner">
                      {operatorInputMode === 'single' ? (
                        <form onSubmit={handleCreateTraineeUser} className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-sans">
                                Trainee Username <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. trainee_01"
                                value={newTraineeUsername}
                                onChange={(e) => setNewTraineeUsername(e.target.value)}
                                className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-none focus:border-indigo-500 font-sans"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-sans">
                                Access Password <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. pass123"
                                value={newTraineePassword}
                                onChange={(e) => setNewTraineePassword(e.target.value)}
                                className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-none focus:border-indigo-500 font-sans"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition"
                            >
                              + Create Trainee Profile
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form onSubmit={handleBatchCreateOperators} className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-sans">
                              Batch Operator Usernames (One per line or CSV: username,password)
                            </label>
                            <textarea
                              rows={4}
                              placeholder="trainee_01&#10;trainee_02,pass456&#10;operator_a&#10;operator_b,secret789"
                              value={bulkInputText}
                              onChange={(e) => setBulkInputText(e.target.value)}
                              className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-none focus:border-indigo-500 font-mono"
                            />
                          </div>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Default Password:</label>
                              <input
                                type="text"
                                value={bulkDefaultPass}
                                onChange={(e) => setBulkDefaultPass(e.target.value)}
                                className="p-1.5 bg-white border border-slate-200 text-xs rounded-lg font-mono font-bold"
                              />
                            </div>
                            <button
                              type="submit"
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition"
                            >
                              ⚡ Provision Accounts
                            </button>
                          </div>
                        </form>
                      )}

                      {userCreationError && (
                        <p className="text-[11px] text-rose-600 font-sans mt-3">{userCreationError}</p>
                      )}
                      {userCreationSuccess && (
                        <p className="text-[11px] text-emerald-600 font-sans mt-3">{userCreationSuccess}</p>
                      )}
                    </div>

                    {/* Active Operator Directory */}
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">
                        Active Sandbox Profiles ({localUsers.length})
                      </span>

                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs border-collapse font-sans">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 font-mono text-[9px] uppercase tracking-wider border-b border-slate-200">
                              <th className="p-3">Operator Username</th>
                              <th className="p-3">Plaintext Access Key</th>
                              <th className="p-3">Assigned Role</th>
                              <th className="p-3">Created Date</th>
                              <th className="p-3 text-right">Delete profile</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {localUsers.map((user) => (
                              <tr key={user.username} className="hover:bg-slate-50/50 transition">
                                <td className="p-3 font-bold text-slate-700">{user.username}</td>
                                <td className="p-3 font-mono text-slate-500 font-bold">{user.passwordText}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans uppercase border ${
                                    user.role === 'admin'
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {user.role}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-400 font-mono text-[10px]">{user.createdAt || '2026-05-22'}</td>
                                <td className="p-3 text-right">
                                  {user.role === 'admin' ? (
                                    <span className="text-[9px] text-slate-400 italic">Core Admin</span>
                                  ) : (
                                    <div className="flex justify-end gap-2 items-center">
                                      {userPendingDelete === user.username ? (
                                        <>
                                          <button
                                            onClick={() => handleDeleteTraineeUser(user.username, true)}
                                            className="text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-extrabold uppercase px-2 py-1 rounded transition cursor-pointer font-sans"
                                          >
                                            Confirm Del?
                                          </button>
                                          <button
                                            onClick={() => setUserPendingDelete(null)}
                                            className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold uppercase font-sans cursor-pointer"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => handleDeleteTraineeUser(user.username)}
                                          className="text-[10px] text-rose-500 hover:text-rose-700 font-bold uppercase transition cursor-pointer font-sans"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* B. ACTIVE WORKSTATION SESSION RUNNING */}
        {isTestActive && expectedDataset[currentIndex] && (() => {
          const currentInvoice = expectedDataset[currentIndex];
          const currentCard = currentInvoice;
          if (!currentCard.target_value) {
            currentCard.target_value = (currentCard as any).expectedValue || currentCard.expectedNumber || '';
          }

          // Dynamic Target Length Detection as specified:
          const requiredDigits = currentCard.target_value 
            ? currentCard.target_value.replace(/\D/g, '').length 
            : (currentCard.custom_digit_length || (currentCard as any).target_digits || 13);

          return (
            <div className="space-y-6 animate-fade-in" id="active-test-container">
              {/* Real-time stats header banner */}
              <Suspense fallback={<StatsPanelSkeleton />}>
                <StatsPanel
                  currentIndex={currentIndex}
                  totalCount={expectedDataset.length}
                  correctCount={correctCount}
                  mistakesCount={mistakesCount}
                  elapsedMs={elapsedMs}
                  averageTimeMs={
                    sessionResults.length > 0 
                      ? Math.round(sessionResults.reduce((sum, r) => sum + r.timeSpentMs, 0) / sessionResults.length) 
                      : 0
                  }
                  isTestActive={true}
                  trainingMode={trainingMode}
                  category={activeTrainingCategory}
                />
              </Suspense>

              {/* Split Screen Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left Column: Image Scan Workstation */}
                <div className="lg:col-span-7">
                  <Suspense fallback={<InvoiceViewerSkeleton />}>
                    <InvoiceViewer
                      currentInvoice={currentInvoice}
                      onImageLoaded={handleInvoiceImageOnLoad}
                      isLoading={false}
                    />
                  </Suspense>
                </div>

                {/* Right Column: Key Entry Node - High-INP Isolated Station */}
                <TypingInputStation
                  key={currentCard.id || currentIndex}
                  currentIndex={currentIndex}
                  totalCards={expectedDataset.length}
                  targetValue={currentCard.target_value}
                  requiredDigits={requiredDigits}
                  category={currentCard.category || activeTrainingCategory}
                  startTime={startTimeRef.current}
                  mistakesCount={mistakesCount}
                  isConfirmingCancel={isConfirmingCancel}
                  onInitiateCancel={() => setIsConfirmingCancel(true)}
                  onConfirmCancel={handleCancelTestingSession}
                  onDismissCancel={() => setIsConfirmingCancel(false)}
                  onPasteBlocked={handlePastePrevent}
                  onCopyBlocked={handleCopyPrevent}
                  onCompleteCard={(finalText, durationMs, metrics) => {
                    verifyAndAdvanceSession(finalText, currentCard.category || activeTrainingCategory, durationMs, metrics);
                  }}
                />
              </div>
            </div>
          );
        })()}

        {/* C. WORKSHEET TEST COMPLETE - CLEAN RESULT SUMMARY MODAL */}
        {testComplete && (() => {
          const evalResult = latestEvaluation || evaluateAllInOneSession(averageTimeMs, mistakesCount);
          const totalSec = Math.floor(sessionTotalTimeMs / 1000);
          const formattedTotalTime = formatMinutesSeconds(sessionTotalTimeMs);
          const avgPaceSec = +(averageTimeMs / 1000).toFixed(2);
          const accuracyPct = expectedDataset.length > 0 ? Math.round((correctCount / expectedDataset.length) * 100) : 100;

          return (
            <div className="space-y-6 animate-fade-in" id="results-display-screen">
              {/* Main Result Summary Modal Card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden animate-fade-in">
                <div className="absolute top-0 right-0 p-10 select-none pointer-events-none opacity-[0.03] text-indigo-600">
                  <Trophy className="w-96 h-96" />
                </div>

                <div className="relative z-10 space-y-8">
                  {/* Top Status & Speed Rank Header */}
                  <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between pb-6 border-b border-slate-200">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* 1. Status Badge: PASSED (Green) or FAILED (Red) */}
                        {evalResult.isPassed ? (
                          <div className="px-5 py-2 rounded-full font-black text-sm uppercase tracking-wider bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 flex items-center gap-2 border border-emerald-400">
                            <Check className="w-5 h-5 stroke-[3]" />
                            <span>STATUS: PASSED</span>
                          </div>
                        ) : (
                          <div className="px-5 py-2 rounded-full font-black text-sm uppercase tracking-wider bg-rose-600 text-white shadow-lg shadow-rose-600/25 flex items-center gap-2 border border-rose-400">
                            <X className="w-5 h-5 stroke-[3]" />
                            <span>STATUS: FAILED</span>
                          </div>
                        )}

                        {/* 2. Speed Rank Badge */}
                        <div className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider border shadow-xs flex items-center gap-1.5 ${evalResult.levelBadgeClass}`}>
                          <Trophy className="w-4 h-4" />
                          <span>{evalResult.levelName}</span>
                        </div>
                      </div>

                      <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-1">
                        {t.resultsTitle}
                      </h2>
                      <p className={`text-xs font-bold ${evalResult.isPassed ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {evalResult.isPassed 
                          ? t.passedNotice 
                          : (mistakesCount > 2 ? t.failedNoticeMistakes : t.failedNoticeSpeed)}
                      </p>
                    </div>

                    {/* Action Buttons: Try Again & View Dashboard */}
                    <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
                      <button
                        onClick={handleRunAgain}
                        id="btn-try-again"
                        className="flex-1 sm:flex-none px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl font-black transition flex items-center justify-center gap-2 shadow-md cursor-pointer text-xs uppercase tracking-wider"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>{t.tryAgainBtn}</span>
                      </button>

                      <button
                        onClick={() => {
                          setTestComplete(false);
                          setIsTestActive(false);
                        }}
                        id="btn-view-dashboard"
                        className="flex-1 sm:flex-none px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold transition flex items-center justify-center border border-slate-300 gap-1.5 cursor-pointer text-xs uppercase tracking-wider"
                      >
                        <BarChart2 className="w-4 h-4 text-slate-600" />
                        <span>{t.viewDashboardBtn}</span>
                      </button>
                    </div>
                  </div>

                  {/* 5-Metric Summary Cards Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 font-mono">
                    {/* Metric 1: Status */}
                    <div className={`p-4 rounded-2xl border ${evalResult.isPassed ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'}`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">{language === 'my' ? 'ရလဒ် အခြေအနေ' : 'Qualification'}</span>
                      <span className={`text-xl font-black mt-1 block ${evalResult.isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {evalResult.isPassed ? (language === 'my' ? 'အောင်မြင် (PASS)' : 'PASSED') : (language === 'my' ? 'မအောင်မြင် (FAIL)' : 'FAILED')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                        {evalResult.isPassed ? (language === 'my' ? 'အမှား ≤ ၂ ခုနှင့် စံချိန်မီ' : '≤ 2 errors & qualified pace') : (evalResult.mistakesCount > 2 ? (language === 'my' ? 'အမှား ၂ ခုထက်ပို၍ မအောင်မြင်' : 'Disqualified (>2 errors)') : (language === 'my' ? 'စံချိန်မမီပါ' : 'Exceeded pace target'))}
                      </span>
                    </div>

                    {/* Metric 2: Speed Rank */}
                    <div className="p-4 rounded-2xl border bg-slate-50 border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">{t.rankBadgeLabel}</span>
                      <span className="text-xl font-black text-indigo-700 mt-1 block">
                        {evalResult.level === 'FAILED' ? (language === 'my' ? 'လေ့ကျင့်ရန်လို' : 'Needs Practice') : `Level ${evalResult.level}`}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                        {evalResult.speedRange}
                      </span>
                    </div>

                    {/* Metric 3: Average Speed */}
                    <div className="p-4 rounded-2xl border bg-slate-50 border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">{t.averageSpeedLabel}</span>
                      <span className="text-xl font-black text-slate-800 mt-1 block">
                        {avgPaceSec}s <span className="text-xs text-slate-400 font-normal">/ {language === 'my' ? 'ကတ်' : 'card'}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                        {language === 'my' ? 'Level A စံချိန် ≤ ၂.၃ စက္ကန့်' : 'Target ≤ 2.3s for Level A'}
                      </span>
                    </div>

                    {/* Metric 4: Total Time */}
                    <div className="p-4 rounded-2xl border bg-slate-50 border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">{t.totalTimeLabel}</span>
                      <span className="text-xl font-black text-slate-800 mt-1 block">
                        {formattedTotalTime}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                        {language === 'my' ? `ကတ် ${expectedDataset.length} ခု စုစုပေါင်း` : `Across ${expectedDataset.length} cards`}
                      </span>
                    </div>

                    {/* Metric 5: Mistakes Count */}
                    <div className={`p-4 rounded-2xl border col-span-2 lg:col-span-1 ${mistakesCount > 2 ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block font-sans">{t.mistakesCountLabel}</span>
                      <span className={`text-xl font-black mt-1 block ${mistakesCount > 2 ? 'text-rose-700' : mistakesCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {mistakesCount} / {expectedDataset.length}
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                        {language === 'my' ? `အများဆုံး ၂ ကြိမ်ခွင့်ပြု (${accuracyPct}% တိကျမှု)` : `Max 2 allowed (${accuracyPct}% accuracy)`}
                      </span>
                    </div>
                  </div>

                  {/* Error Review Toggle Section */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className={`w-4 h-4 ${mistakesList.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-800 font-sans">
                          Mistake Audit Trail ({mistakesList.length} Errors Found)
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowErrorReview(!showErrorReview)}
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition shadow-2xs font-sans"
                      >
                        {showErrorReview ? '▲ Hide Error Review' : `🔍 Show Error Review (${mistakesList.length})`}
                      </button>
                    </div>

                    {showErrorReview && (
                      <div className="pt-2 animate-fade-in">
                        {mistakesList.length === 0 ? (
                          <div className="p-4 bg-emerald-100/70 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 font-sans flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
                            <span>100% Perfect Accuracy! Zero mistyped cards across all 100 entries.</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-left text-xs border-collapse font-mono">
                              <thead>
                                <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                                  <th className="p-3">Card #</th>
                                  <th className="p-3">Category</th>
                                  <th className="p-3">Expected Target</th>
                                  <th className="p-3 text-rose-600">Your Typed Value</th>
                                  <th className="p-3">Elapsed Time</th>
                                  <th className="p-3 text-right">Error Result</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-150">
                                {mistakesList.map((m, idx) => (
                                  <tr key={idx} className="hover:bg-rose-50/30 transition">
                                    <td className="p-3 font-bold text-indigo-700">Card #{m.cardIndex}</td>
                                    <td className="p-3 font-sans">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                                        {m.category === 'date_number' ? '📅 Date' : m.category === 'phone_number' ? '📞 Phone' : '🧾 Tax No'}
                                      </span>
                                    </td>
                                    <td className="p-3 font-bold text-emerald-700 bg-emerald-50/30">{m.expectedNumber}</td>
                                    <td className="p-3 font-bold text-rose-600 bg-rose-50/50">
                                      {m.typedNumber || <span className="italic text-slate-400 font-normal">[empty]</span>}
                                    </td>
                                    <td className="p-3 text-slate-600">{(m.timeSpentMs / 1000).toFixed(2)}s</td>
                                    <td className="p-3 text-right">
                                      <span className="text-[10px] font-black uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                                        Mismatch
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Certificate Downloads */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-150 text-xs">
                    <span className="text-slate-500 font-sans">
                      Session recorded in database table <strong className="font-mono text-slate-700">training_sessions</strong>.
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadPDF}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer text-xs uppercase tracking-wider font-sans"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </button>
                      <button
                        onClick={handleDownloadHTML}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer text-xs uppercase tracking-wider font-sans"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download HTML</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Complete Chronological 100-Card Audit Trail */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-indigo-650" /> Complete 100-Card Transcription Chronology
                  </h3>
                  <span className="text-xs font-mono text-slate-400">CARDS 1 TO 100 SEQUENTIAL</span>
                </div>

                <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider pb-3 text-[10px] sticky top-0 bg-white">
                        <th className="pb-3 text-left">No.</th>
                        <th className="pb-3">Category</th>
                        <th className="pb-3">Expected Target</th>
                        <th className="pb-3 text-slate-600">Your Typing Input</th>
                        <th className="pb-3">Time</th>
                        <th className="pb-3 text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {sessionResults.map((result, idx) => {
                        const isUnderTarget = result.timeSpentMs <= 2300;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition text-slate-700">
                            <td className="py-2.5 font-semibold text-slate-400">{String(idx + 1).padStart(2, '0')}</td>
                            <td className="py-2.5 font-sans">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase border border-slate-200">
                                {result.category === 'date_number' ? 'Date' : result.category === 'phone_number' ? 'Phone' : 'Tax'}
                              </span>
                            </td>
                            <td className="py-2.5 font-bold text-slate-900">{result.expectedNumber}</td>
                            <td className="py-2.5 text-slate-700">{result.typedNumber || <span className="italic text-slate-400">[empty]</span>}</td>
                            <td className={`py-2.5 font-semibold ${isUnderTarget ? 'text-indigo-600' : 'text-slate-600'}`}>
                              {(result.timeSpentMs / 1000).toFixed(2)}s
                            </td>
                            <td className="py-2.5 text-right">
                              {result.isCorrect ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-emerald-200">
                                  <Check className="w-3 h-3 text-emerald-700" /> Match
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-rose-200">
                                  <X className="w-3 h-3 text-rose-700" /> Mistake
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Bottom Section: Speed Dashboard, Trainee Logs & Login History (Admin Only with Unhide/Hide toggle) */}
        {currentOfflineUser?.role === 'admin' ? (
          <div className="space-y-4 animate-fade-in" id="admin-analytics-section">
            {!showAdminLogs ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shrink-0">
                    <Shield className="w-5 h-5 text-indigo-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <span>{language === 'my' ? 'အက်ဒမင် စာရင်းဇယား၊ အမြန်နှုန်းမှတ်တမ်း & ဝင်ရောက်မှုမှတ်တမ်း' : 'Speed Dashboard, Trainee Typing Logs & Login History'}</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{t.adminBadge}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-sans">
                      {language === 'my' 
                        ? 'လုံခြုံရေးအရ ပုံမှန်အားဖြင့် ဝှက်ထားပါသည်။ အချက်အလက်များ စစ်ဆေးရန် "Unhide" ခလုတ်ကို နှိပ်ပါ။'
                        : 'Hidden by default for privacy. Only Admin can check. Click "Unhide" to inspect speed rankings, typing logs, and login audit trails.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdminLogs(true)}
                  aria-expanded="false"
                  aria-controls="admin-history-logs-container"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm transition shrink-0 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <Eye className="w-4 h-4" aria-hidden="true" />
                  <span>{language === 'my' ? 'အချက်အလက်များ ဖော်ပြမည် (Unhide)' : 'Unhide Dashboard & Logs'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 animate-fade-in" id="admin-history-logs-container">
                <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2.5 rounded-xl border border-slate-800 shadow-sm flex-wrap gap-2">
                  <span className="text-xs font-bold flex items-center gap-2 font-mono text-indigo-300">
                    <Eye className="w-4 h-4 text-emerald-400" aria-hidden="true" /> 
                    <span>ADMIN AUDIT ACTIVE // SPEED DASHBOARD & TRAINEE LOGS UNHIDDEN</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAdminLogs(false)}
                    aria-expanded="true"
                    aria-controls="admin-history-logs-container"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                    <span>{language === 'my' ? 'ပြန်လည်ဝှက်ထားမည် (Hide)' : 'Hide Dashboard & Logs'}</span>
                  </button>
                </div>

                <Suspense fallback={<HistoryLogsSkeleton />}>
                  <HistoryLogs 
                    userId={currentOfflineUser ? currentOfflineUser.username : 'admin'} 
                    refreshTrigger={refreshTrigger}
                    isAdmin={true}
                    onHide={() => setShowAdminLogs(false)}
                  />
                </Suspense>
              </div>
            )}
          </div>
        ) : null}

      </main>

      {/* Footer System Indicator */}
      <footer className="bg-slate-900 border-t border-slate-950 py-6 text-center text-slate-400 text-xs mt-auto select-none font-sans">
        <p className="font-semibold text-white">Japanese Invoice Speed Assessment Node | Multi-Category Training Hub</p>
        <p className="mt-1 text-slate-400 text-[11px]">Tax Number • Transaction Date • Contact Phone Number. High precision performance.now() chronometer active.</p>
      </footer>

      {/* Interactive Batch Labeling Assistant Lightbox modal */}
      {labelingModalIndex !== null && customInvoices[labelingModalIndex] && (() => {
        const inv = customInvoices[labelingModalIndex];
        const modalCategory = inv.category || 'tax_number';
        
        const handleNextLabel = () => {
          if (labelingModalIndex < customInvoices.length - 1) {
            setLabelingModalIndex(labelingModalIndex + 1);
          } else {
            setLabelingModalIndex(null);
          }
        };

        const handlePrevLabel = () => {
          if (labelingModalIndex > 0) {
            setLabelingModalIndex(labelingModalIndex - 1);
          }
        };

        return (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" id="labeling-assistant-modal">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col md:flex-row max-h-[90vh]">
              
              {/* Left Side: Invoice Preview Card */}
              <div className="bg-slate-950 p-6 flex flex-col justify-between items-center md:w-[45%] border-r border-slate-800 min-h-[300px] relative">
                <div className="absolute top-3 left-3 flex items-center gap-1 bg-slate-800 text-slate-300 font-mono text-[9px] uppercase px-1.5 py-0.5 rounded tracking-wide">
                  <span>Doc {labelingModalIndex + 1} of {customInvoices.length}</span>
                </div>
                
                <button 
                  onClick={() => setLabelingModalIndex(null)}
                  aria-label="Close Preview"
                  className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex-1 w-full flex items-center justify-center p-2 mb-4 mt-6 overflow-hidden max-h-[380px]">
                  <img 
                    src={inv.customImageUrl} 
                    alt="Receipt Preview" 
                    width={400}
                    height={560}
                    style={{ aspectRatio: '400 / 560' }}
                    className="max-h-full max-w-full rounded shadow-md object-contain border border-slate-850"
                  />
                </div>

                <div className="w-full text-center">
                  <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                    Interactive Image Zoom
                  </p>
                </div>
              </div>

              {/* Right Side: Data Labeler Fields */}
              <div className="p-6 md:w-[55%] flex flex-col justify-between bg-white overflow-y-auto">
                <div className="space-y-5">
                  <div>
                    <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest block mb-1">
                      🏷️ Batch Reviewer
                    </span>
                    <h3 className="text-lg font-bold text-slate-800 font-sans tracking-tight leading-none">
                      Verify & Set Codes
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {modalCategory === 'date_number' 
                        ? 'Review receipt image and verify the 8-digit transaction date (YYYYMMDD).'
                        : modalCategory === 'phone_number'
                        ? 'Review receipt image and verify the contact telephone digits.'
                        : 'Review receipt image and verify the 13-digit Qualified Tax registration number starting with "T".'}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      {/* Visual Confirmation of Image ID */}
                      <div className="mb-2 p-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl flex items-center justify-between shadow-2xs">
                        <span className="text-xs font-bold font-mono text-indigo-900">
                          Image ID: {(inv as any).matchedIdentifier || (inv as any).title || inv.companyName || inv.id} {(inv as any).matchedFromCsv ? '(Matched from CSV)' : ''}
                        </span>
                        {(inv as any).matchedFromCsv && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-1.5 py-0.5 rounded-full">
                            Matched from CSV
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                        <div className="sm:col-span-8">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate">
                            Expected Transcribed Value <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              placeholder={modalCategory === 'date_number' ? '20260522' : modalCategory === 'phone_number' ? '0312345678' : 'e.g. 2026720 or 1234567890123'}
                              value={inv.expectedNumber}
                              autoFocus
                              onChange={(e) => {
                                const newCode = e.target.value;
                                const digits = newCode.replace(/\D/g, '').length;
                                updateCustomInvoiceCode(inv.id, newCode, digits > 0 ? digits : undefined);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleNextLabel();
                                }
                              }}
                              className="w-full p-2.5 bg-slate-50 border border-slate-205 text-sm text-slate-800 font-mono font-bold rounded-xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 tracking-wide text-indigo-700"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 truncate">
                            Target Digits
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            placeholder="Length"
                            value={inv.target_digits || inv.custom_digit_length || (inv.expectedNumber ? inv.expectedNumber.replace(/\D/g, '').length : '')}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                              updateCustomInvoiceCode(inv.id, inv.expectedNumber, val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleNextLabel();
                              }
                            }}
                            className="w-full p-2.5 bg-slate-50 border border-slate-205 text-sm text-slate-800 font-mono font-bold rounded-xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 text-center"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal font-sans">
                        Press <strong className="text-slate-700 font-bold">Enter</strong> to save and go to next image automatically.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Invoice Issuer / Business Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Aeon Co., Ltd."
                        maxLength={36}
                        value={inv.companyName}
                        onChange={(e) => updateCustomInvoiceCompany(inv.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleNextLabel();
                          }
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-205 text-xs text-slate-800 rounded-xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 mt-6 flex justify-between items-center gap-3">
                  <button
                    onClick={handlePrevLabel}
                    disabled={labelingModalIndex === 0}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold font-sans flex items-center justify-center transition uppercase tracking-wider ${
                      labelingModalIndex === 0
                        ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed'
                        : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
                  </button>

                  <span className="text-[9px] text-slate-400 font-mono tracking-wider uppercase font-semibold">
                    Doc {labelingModalIndex + 1} of {customInvoices.length}
                  </span>

                  <button
                    onClick={handleNextLabel}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold font-sans rounded-lg transition flex items-center justify-center uppercase tracking-wider cursor-pointer shadow-sm"
                  >
                    {labelingModalIndex === customInvoices.length - 1 ? 'Close Reviewer' : 'Next'} <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
