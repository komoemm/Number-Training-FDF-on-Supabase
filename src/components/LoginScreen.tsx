/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Key, AlertCircle, Sparkles, Zap, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, passwordText: string) => { success: boolean; error?: string };
  localUsers: any[];
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setErrorMsg('Please enter your Operator ID / Username.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    const res = onLogin(trimmedUser, password);
    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  const handleShortcutLogin = (user: string, pass: string) => {
    setErrorMsg(null);
    setUsername(user);
    setPassword(pass);
    const res = onLogin(user, pass);
    if (!res.success) {
      setErrorMsg(res.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  return (
    <main 
      className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 font-sans text-slate-100" 
      id="login-screen-root"
      role="main"
      aria-labelledby="login-main-heading"
    >
      {/* Decorative ambient background glows */}
      <div 
        aria-hidden="true" 
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" 
      />
      <div 
        aria-hidden="true" 
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-[120px] pointer-events-none" 
      />

      <div className="w-full max-w-md z-10 space-y-6">
        {/* Upper Title Section */}
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-indigo-950/80 border border-indigo-400/30 rounded-full px-3.5 py-1 text-xs font-bold text-indigo-300 font-sans uppercase tracking-wider shadow-xs">
            <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
            <span>JP-QIN-13 Workstation Portal</span>
          </div>
          
          <h1 
            id="login-main-heading"
            className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight font-sans pt-1"
          >
            Support Training System
          </h1>
          <p className="text-slate-300 text-xs font-mono tracking-wider uppercase">
            Qualified Invoice Speed Assessment
          </p>
        </header>

        {/* Central Authorization Card */}
        <section 
          className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6" 
          id="login-card"
          aria-labelledby="operator-sign-in-heading"
        >
          <div className="space-y-1.5 text-center">
            <div 
              aria-hidden="true" 
              className="w-12 h-12 rounded-xl bg-indigo-950/90 border border-indigo-400/40 flex items-center justify-center mx-auto text-indigo-300 shadow-inner"
            >
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 id="operator-sign-in-heading" className="text-lg sm:text-xl font-bold text-white tracking-tight pt-1">
              Operator Sign-In
            </h2>
            <p className="text-xs text-slate-300">
              Provide credentials to access speed assessment modules
            </p>
          </div>

          <form 
            id="operator-login-form"
            onSubmit={handleSubmit} 
            noValidate 
            className="space-y-4"
            aria-describedby={errorMsg ? "login-error-alert" : undefined}
          >
            {/* Live Error Notification Banner */}
            {errorMsg && (
              <div 
                id="login-error-alert"
                role="alert" 
                aria-live="assertive"
                className="flex items-start gap-2.5 bg-rose-950/80 border border-rose-500/60 rounded-xl p-3.5 text-xs text-rose-100 animate-fade-in"
              >
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="font-semibold leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* Username Field */}
            <div className="space-y-1.5">
              <label 
                htmlFor="login-username" 
                className="block text-xs font-semibold text-slate-200 tracking-wide"
              >
                Operator ID / Username <span className="text-rose-400" aria-hidden="true">*</span>
              </label>
              <div className="relative flex items-center">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  placeholder="e.g. admin or guest"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck="false"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errorMsg)}
                  aria-describedby={errorMsg ? "login-error-alert" : undefined}
                  className="w-full bg-slate-950 text-white placeholder-slate-400 border border-slate-700 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40 rounded-xl py-3 pl-10 pr-4 text-sm outline-hidden transition"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label 
                htmlFor="login-password" 
                className="block text-xs font-semibold text-slate-200 tracking-wide"
              >
                Password <span className="text-rose-400" aria-hidden="true">*</span>
              </label>
              <div className="relative flex items-center">
                <Key className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(errorMsg)}
                  aria-describedby={errorMsg ? "login-error-alert" : undefined}
                  className="w-full bg-slate-950 text-white placeholder-slate-400 border border-slate-700 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40 rounded-xl py-3 pl-10 pr-4 text-sm outline-hidden transition"
                />
              </div>
            </div>

            {/* Login Submit Button */}
            <button
              type="submit"
              id="login-submit-button"
              className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold p-3 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer shadow-lg hover:shadow-indigo-500/20 text-xs sm:text-sm uppercase tracking-wider font-sans mt-2 focus-visible:outline-2 focus-visible:outline-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-400/50"
            >
              <span>Authenticate Operator</span>
              <ArrowRight className="w-4 h-4 text-white" aria-hidden="true" />
            </button>
          </form>

          {/* Quick Shortcuts Box for Easy Testing */}
          <section 
            className="border-t border-slate-800 pt-5 space-y-3" 
            id="shortcut-accounts"
            aria-labelledby="default-accounts-heading"
          >
            <h3 
              id="default-accounts-heading"
              className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              <span>Default Sandbox Accounts</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Admin shortcut login */}
              <button
                type="button"
                onClick={() => handleShortcutLogin('admin', 'admin')}
                aria-label="Log in as Administrator with username admin and password admin"
                className="flex flex-col items-start bg-slate-950 hover:bg-slate-900 border border-slate-700/80 hover:border-indigo-500/80 rounded-xl p-3 text-left transition cursor-pointer text-xs min-h-[54px] focus-visible:outline-2 focus-visible:outline-indigo-300"
              >
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1">
                  👑 Administrator
                </span>
                <span className="text-xs text-indigo-300 font-bold font-mono mt-0.5">
                  admin / admin
                </span>
                <span className="text-[11px] text-slate-300 mt-1 leading-tight">
                  Full operator management & reports
                </span>
              </button>

              {/* Trainee shortcut login */}
              <button
                type="button"
                onClick={() => handleShortcutLogin('guest', 'guest')}
                aria-label="Log in as Practice Student with username guest and password guest"
                className="flex flex-col items-start bg-slate-950 hover:bg-slate-900 border border-slate-700/80 hover:border-pink-500/80 rounded-xl p-3 text-left transition cursor-pointer text-xs min-h-[54px] focus-visible:outline-2 focus-visible:outline-pink-300"
              >
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1">
                  🎓 Practice Student
                </span>
                <span className="text-xs text-pink-300 font-bold font-mono mt-0.5">
                  guest / guest
                </span>
                <span className="text-[11px] text-slate-300 mt-1 leading-tight">
                  Standard speed benchmark runs
                </span>
              </button>
            </div>
          </section>
        </section>

        {/* Footer info label */}
        <footer className="text-center">
          <p className="text-xs text-slate-400 font-mono">
            Support Training Offline Module // ISO-6004 Typing Standard
          </p>
        </footer>
      </div>
    </main>
  );
}

