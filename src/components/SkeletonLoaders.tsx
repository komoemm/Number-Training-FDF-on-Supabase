/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Shimmer wave overlay for premium skeleton feedback
 */
export function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div 
      className={`relative overflow-hidden bg-slate-200/80 dark:bg-slate-800/80 rounded-md before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Smooth skeleton loader for the InvoiceViewer component
 */
export function InvoiceViewerSkeleton() {
  return (
    <div 
      role="status" 
      aria-label="Loading invoice scanner"
      className="w-full bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-4 min-h-[460px] animate-pulse select-none"
    >
      {/* Top toolbar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-700/80" />
          <div className="h-4 w-32 rounded bg-slate-700/80" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-slate-800 border border-slate-700/50" />
          <div className="h-7 w-7 rounded-lg bg-slate-800 border border-slate-700/50" />
          <div className="h-7 w-16 rounded-lg bg-slate-800 border border-slate-700/50" />
        </div>
      </div>

      {/* Main scan canvas preview area */}
      <div className="flex-1 w-full bg-slate-950/70 border border-slate-800/60 rounded-xl p-8 flex items-center justify-center relative overflow-hidden min-h-[340px]">
        {/* Simulated receipt sheet */}
        <div className="w-full max-w-sm bg-slate-100 rounded-lg shadow-2xl p-6 space-y-4 opacity-90">
          <div className="flex justify-between items-center pb-3 border-b border-dashed border-slate-300">
            <div className="h-5 w-28 bg-slate-300 rounded" />
            <div className="h-3 w-16 bg-slate-200 rounded" />
          </div>

          <div className="space-y-2 py-2">
            <div className="h-3 w-3/4 bg-slate-200 rounded" />
            <div className="h-3 w-1/2 bg-slate-200 rounded" />
          </div>

          {/* Highlighted Tax / Target Number Box */}
          <div className="p-3 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-lg space-y-1.5">
            <div className="h-2.5 w-20 bg-indigo-200 rounded" />
            <div className="h-6 w-full bg-indigo-100 rounded" />
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between">
              <div className="h-2.5 w-24 bg-slate-200 rounded" />
              <div className="h-2.5 w-12 bg-slate-200 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-2.5 w-20 bg-slate-200 rounded" />
              <div className="h-2.5 w-14 bg-slate-200 rounded" />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-300 flex justify-between items-center">
            <div className="h-3.5 w-16 bg-slate-300 rounded" />
            <div className="h-5 w-24 bg-slate-400 rounded" />
          </div>
        </div>
      </div>

      {/* Bottom helper text */}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
        <div className="h-3 w-40 bg-slate-800 rounded" />
        <div className="h-3 w-24 bg-slate-800 rounded" />
      </div>
      <span className="sr-only">Loading invoice scanner...</span>
    </div>
  );
}

/**
 * Smooth skeleton loader for CategorySandbox
 */
export function CategorySandboxSkeleton() {
  return (
    <div 
      role="status" 
      aria-label="Loading card pool sandbox"
      className="w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 animate-pulse select-none"
    >
      {/* Header & Controls bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-72 bg-slate-100 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-slate-100 rounded-lg border border-slate-200" />
          <div className="h-9 w-32 bg-indigo-100 rounded-lg" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <div className="h-8 w-24 bg-indigo-50 border border-indigo-200 rounded-lg" />
        <div className="h-8 w-24 bg-slate-100 rounded-lg" />
        <div className="h-8 w-24 bg-slate-100 rounded-lg" />
      </div>

      {/* Card Grid Skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="w-full aspect-[3/4] bg-slate-200 rounded-lg" />
            <div className="h-3 w-3/4 bg-slate-200 rounded" />
            <div className="h-2.5 w-1/2 bg-slate-100 rounded" />
            <div className="h-5 w-full bg-slate-200 rounded-md" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading card pool sandbox...</span>
    </div>
  );
}

/**
 * Smooth skeleton loader for HistoryLogs & Speed Dashboard
 */
export function HistoryLogsSkeleton() {
  return (
    <div 
      role="status" 
      aria-label="Loading speed dashboard and logs"
      className="w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 animate-pulse select-none"
    >
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="h-3 w-20 bg-slate-200 rounded" />
            <div className="h-7 w-28 bg-slate-300 rounded" />
          </div>
        ))}
      </div>

      {/* Table Skeletons */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="bg-slate-50 px-4 py-3 flex justify-between border-b border-slate-200">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-4 w-16 bg-slate-200 rounded" />
        </div>
        {/* Table Rows */}
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex justify-between items-center">
              <div className="space-y-1.5 w-1/4">
                <div className="h-3.5 w-32 bg-slate-200 rounded" />
                <div className="h-2.5 w-20 bg-slate-100 rounded" />
              </div>
              <div className="h-4 w-16 bg-slate-200 rounded" />
              <div className="h-5 w-20 bg-emerald-100 rounded-full" />
              <div className="h-4 w-14 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading speed dashboard and logs...</span>
    </div>
  );
}

/**
 * Smooth skeleton loader for StatsPanel
 */
export function StatsPanelSkeleton() {
  return (
    <div 
      role="status" 
      aria-label="Loading session statistics"
      className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-xs animate-pulse select-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Progress & Card Counter */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 bg-indigo-100 rounded-xl" />
          <div className="h-4 w-36 bg-slate-200 rounded" />
        </div>

        {/* SLA & Timer Gauge */}
        <div className="flex items-center gap-4">
          <div className="h-7 w-24 bg-slate-100 border border-slate-200 rounded-lg" />
          <div className="h-7 w-20 bg-emerald-100 rounded-lg" />
          <div className="h-7 w-20 bg-rose-100 rounded-lg" />
        </div>
      </div>

      {/* Progress Bar Skeleton */}
      <div className="mt-3 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="w-1/3 h-full bg-indigo-200 rounded-full" />
      </div>
      <span className="sr-only">Loading session statistics...</span>
    </div>
  );
}

/**
 * Smooth skeleton loader for LoginScreen
 */
export function LoginScreenSkeleton() {
  return (
    <div 
      role="status" 
      aria-label="Loading authentication screen"
      className="min-h-screen flex items-center justify-center bg-slate-900 p-6 animate-pulse select-none"
    >
      <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/60 rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/30 border border-indigo-400/40" />
          <div className="h-6 w-48 bg-slate-700 rounded-md" />
          <div className="h-3.5 w-64 bg-slate-700/60 rounded-md" />
        </div>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <div className="h-3 w-20 bg-slate-700 rounded" />
            <div className="h-11 w-full bg-slate-900/80 border border-slate-700 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-20 bg-slate-700 rounded" />
            <div className="h-11 w-full bg-slate-900/80 border border-slate-700 rounded-xl" />
          </div>
          <div className="h-11 w-full bg-indigo-600/60 rounded-xl" />
        </div>
      </div>
      <span className="sr-only">Loading authentication screen...</span>
    </div>
  );
}
