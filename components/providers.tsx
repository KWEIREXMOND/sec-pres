'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser, Notification, Organization } from '@/lib/shared-types';
import { apiGet, apiPatch, apiPost, getActiveWorkspaceId, openEventStream, setActiveWorkspaceId, setCsrfToken, setSessionToken, ApiError } from '@/lib/api';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside AppProviders.');
  return context;
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
            <div className="font-semibold text-sm">{toast.title}</div>
            {toast.description && <div className="mt-1 text-xs opacity-90">{toast.description}</div>}
            <button className="toast-close" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface AuthConfig {
  showResetLinks: boolean;
  maxUploadBytes: number;
  supabaseAuthEnabled: boolean;
  realtimeMode: 'sse' | 'supabase';
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  config: AuthConfig | null;
  providerStatus: Array<{ channel: string; configured: boolean }>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AppProviders.');
  return context;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [providerStatus, setProviderStatus] = useState<Array<{ channel: string; configured: boolean }>>([]);

  const applySession = useCallback((nextUser: AuthUser, nextConfig?: AuthConfig, nextProviders?: Array<{ channel: string; configured: boolean }>) => {
    setUser(nextUser);
    setCsrfToken(nextUser.csrf_token);
    if (nextConfig) setConfig(nextConfig);
    if (nextProviders) setProviderStatus(nextProviders);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ user: AuthUser; config: AuthConfig; providerStatus: Array<{ channel: string; configured: boolean }> }>('/auth/me');
      applySession(data.user, data.config, data.providerStatus);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setCsrfToken(null);
        setSessionToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiPost<{ user: AuthUser; csrfToken: string; sessionToken?: string | null }>('/auth/login', { email, password });
      if (data.sessionToken) setSessionToken(data.sessionToken);
      applySession(data.user);
      setLoading(false);
      await refresh();
      return data.user;
    },
    [applySession, refresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      setUser(null);
      setCsrfToken(null);
      setSessionToken(null);
      setConfig(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, config, providerStatus, login, logout, refresh, setUser }),
    [user, loading, config, providerStatus, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

interface WorkspaceContextValue {
  organizations: Organization[];
  activeWorkspace: Organization | null;
  setActiveWorkspace: (id: string) => void;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside AppProviders.');
  return context;
}

function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const organizations = useMemo(() => user?.organizations || [], [user]);

  useEffect(() => {
    if (!organizations.length) {
      setActiveId(null);
      setActiveWorkspaceId(null);
      return;
    }
    const stored = getActiveWorkspaceId();
    const next = organizations.find((org) => org.id === stored)?.id || organizations[0].id;
    setActiveId(next);
    setActiveWorkspaceId(next);
  }, [organizations]);

  const setActiveWorkspace = useCallback((id: string) => {
    setActiveId(id);
    setActiveWorkspaceId(id);
  }, []);

  const activeWorkspace = organizations.find((org) => org.id === activeId) || organizations[0] || null;
  const value = useMemo<WorkspaceContextValue>(
    () => ({ organizations, activeWorkspace, setActiveWorkspace, loading: authLoading && !user }),
    [organizations, activeWorkspace, setActiveWorkspace, authLoading, user],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

interface RealtimeContextValue {
  notifications: Notification[];
  unreadCount: number;
  unreadMessages: number;
  version: number;
  connected: boolean;
  mode: 'sse' | 'supabase' | 'polling';
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside AppProviders.');
  return context;
}

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<'sse' | 'supabase' | 'polling'>('polling');
  const lastToastRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [notificationData, messageData] = await Promise.all([
        apiGet<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
        apiGet<{ unreadCount: number }>('/messages?box=inbox'),
      ]);
      setNotifications(notificationData.notifications);
      setUnreadCount(notificationData.unreadCount);
      setUnreadMessages(messageData.unreadCount);
    } catch {
      // Keep the last known state; the next event or poll retries.
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setUnreadMessages(0);
      setConnected(false);
      return;
    }
    void refresh();
    let cleanup = () => {};
    let poll: ReturnType<typeof setInterval> | undefined;

    const handlePayload = (payload: any) => {
      setVersion((value) => value + 1);
      if (payload?.type === 'notification' && payload.notification) {
        const notification = payload.notification as Notification;
        setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 60));
        setUnreadCount((current) => current + 1);
        const now = Date.now();
        if ((notification.severity === 'critical' || notification.severity === 'warning') && now - lastToastRef.current > 1200) {
          lastToastRef.current = now;
          showToast({ title: notification.title, description: notification.body, tone: notification.severity === 'critical' ? 'error' : 'warning' });
        }
      }
      if (payload?.type === 'refresh') setVersion((value) => value + 1);
      void refresh();
    };

    if (user.realtime.mode === 'sse') {
      setMode('sse');
      cleanup = openEventStream('/events/stream', {
        onOpen: () => {
          setConnected(true);
          setMode('sse');
        },
        onEvent: (event, data) => {
          if (event === 'connected') {
            setConnected(true);
            return;
          }
          if (event === 'notification') {
            try {
              handlePayload(JSON.parse(data));
            } catch {
              setVersion((value) => value + 1);
            }
          }
        },
        onError: () => {
          setConnected(false);
          setMode('polling');
        },
      });
    } else if (user.realtime.mode === 'supabase' && user.realtime.url && user.realtime.anon_key && user.realtime.channel) {
      setMode('supabase');
      let channel: any = null;
      let client: any = null;
      void (async () => {
        try {
          const module = await import('@supabase/supabase-js');
          client = module.createClient(user.realtime.url!, user.realtime.anon_key!, { auth: { persistSession: false } });
          channel = client.channel(user.realtime.channel!);
          channel.on('broadcast', { event: 'notification' }, (message: any) => handlePayload(message.payload));
          channel.subscribe((status: string) => setConnected(status === 'SUBSCRIBED'));
        } catch {
          setMode('polling');
          setConnected(false);
        }
      })();
      cleanup = () => {
        if (channel && client) void client.removeChannel(channel);
      };
    }

    poll = setInterval(() => void refresh(), 30_000);
    return () => {
      cleanup();
      if (poll) clearInterval(poll);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.realtime.mode, user?.realtime.channel, refresh, showToast]);

  const markRead = useCallback(
    async (id: string) => {
      const result = await apiPatch<{ unreadCount: number }>(`/notifications/${id}/read`);
      setNotifications((current) => current.map((item) => (item.id === id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item)));
      setUnreadCount(result.unreadCount);
      setVersion((value) => value + 1);
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    await apiPost('/notifications/read-all');
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })));
    setUnreadCount(0);
    setVersion((value) => value + 1);
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({ notifications, unreadCount, unreadMessages, version, connected, mode, refresh, markRead, markAllRead }),
    [notifications, unreadCount, unreadMessages, version, connected, mode, refresh, markRead, markAllRead],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
