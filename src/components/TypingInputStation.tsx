/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { TrainingCategory } from '../types';

export interface TypingCardMetrics {
  wpm: number;
  cpm: number;
  accuracy: number;
  timeSpentMs: number;
  keystrokeCount: number;
}

export interface TypingInputStationProps {
  currentIndex: number;
  totalCards: number;
  targetValue: string;
  requiredDigits: number;
  category: TrainingCategory;
  startTime: number;
  mistakesCount: number;
  isConfirmingCancel: boolean;
  onInitiateCancel: () => void;
  onConfirmCancel: () => void;
  onDismissCancel: () => void;
  onPasteBlocked?: (e: React.ClipboardEvent) => void;
  onCopyBlocked?: (e: React.ClipboardEvent) => void;
  onCompleteCard: (typedValue: string, durationMs: number, metrics: TypingCardMetrics) => void;
}

/**
 * High-Performance Isolated Typing Station
 * 
 * Performance & INP Optimizations:
 * 1. Isolates keystroke state to eliminate parent component re-renders during active typing.
 * 2. Uses high-precision performance.now() for WPM, CPM, and Accuracy calculations.
 * 3. Keeps calculations non-blocking using microtasks / RAF to prevent main thread DOM bottlenecks.
 * 4. Provides accessible ARIA attributes: role="status" and aria-live="polite".
 */
export const TypingInputStation = memo(function TypingInputStation({
  currentIndex,
  totalCards,
  targetValue,
  requiredDigits,
  category,
  startTime,
  mistakesCount,
  isConfirmingCancel,
  onInitiateCancel,
  onConfirmCancel,
  onDismissCancel,
  onPasteBlocked,
  onCopyBlocked,
  onCompleteCard
}: TypingInputStationProps) {
  // Local isolated input state (does NOT re-render parent App on each keystroke)
  const [typedValue, setTypedValue] = useState<string>('');
  const [lastCharacterValid, setLastCharacterValid] = useState<boolean | null>(null);
  const [liveAccuracyAnnouncement, setLiveAccuracyAnnouncement] = useState<string>('');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const keystrokeTimestampsRef = useRef<number[]>([]);
  const isAdvancingRef = useRef<boolean>(false);

  // Clean target digits for comparison
  const expDigitsOnly = (targetValue || '').replace(/\D/g, '');

  // Reset local state and autofocus whenever the card index or target changes
  useEffect(() => {
    setTypedValue('');
    setLastCharacterValid(null);
    keystrokeTimestampsRef.current = [];
    isAdvancingRef.current = false;

    // High-priority autofocus on card transition
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex, targetValue]);

  /**
   * High-precision keystroke performance metrics calculator.
   * Runs in-memory with sub-millisecond precision without blocking DOM paints.
   */
  const computeKeystrokeMetrics = useCallback((currentText: string, finishTimestamp: number): TypingCardMetrics => {
    const totalTimeMs = Math.max(1, Math.round(finishTimestamp - startTime));
    const elapsedSec = totalTimeMs / 1000;
    const cleanTyped = currentText.replace(/\D/g, '');
    const charCount = cleanTyped.length;

    // High-precision CPM & WPM calculation
    const cpm = elapsedSec > 0 ? Math.round((charCount / elapsedSec) * 60) : 0;
    const wpm = Math.round(cpm / 5);

    // Keystroke Accuracy: check character-by-character against expected prefix
    let matchingChars = 0;
    for (let i = 0; i < cleanTyped.length; i++) {
      if (cleanTyped[i] === expDigitsOnly[i]) {
        matchingChars++;
      }
    }
    const accuracy = charCount > 0 ? Math.round((matchingChars / charCount) * 100) : 100;

    return {
      wpm,
      cpm,
      accuracy,
      timeSpentMs: totalTimeMs,
      keystrokeCount: keystrokeTimestampsRef.current.length || charCount
    };
  }, [startTime, expDigitsOnly]);

  /**
   * Handle card submission smoothly
   */
  const submitCurrentCard = useCallback((finalText: string) => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;

    const finishNow = performance.now();
    const durationMs = Math.max(1, Math.round(finishNow - startTime));
    const metrics = computeKeystrokeMetrics(finalText, finishNow);

    const isMatch = finalText.replace(/\D/g, '') === expDigitsOnly;
    setLiveAccuracyAnnouncement(
      isMatch 
        ? `Card ${currentIndex + 1} completed correctly with 100% accuracy in ${(durationMs / 1000).toFixed(2)} seconds.`
        : `Card ${currentIndex + 1} completed with mistake. Recorded ${metrics.accuracy}% character accuracy.`
    );

    // Schedule submission to ensure current input event paint cycle finishes with 0ms INP delay
    requestAnimationFrame(() => {
      onCompleteCard(finalText, durationMs, metrics);
    });
  }, [currentIndex, startTime, expDigitsOnly, computeKeystrokeMetrics, onCompleteCard]);

  /**
   * Category-aware input filtering & auto-advance handler.
   * State updates are completely localized to this component.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const keyTime = performance.now();
    keystrokeTimestampsRef.current.push(keyTime);

    // Filter to digits and clamp to dynamic requiredDigits
    const cleaned = rawVal.replace(/\D/g, '').slice(0, requiredDigits);
    setTypedValue(cleaned);

    // High-precision character-by-character integrity validation
    if (cleaned.length > 0) {
      const isValid = expDigitsOnly.startsWith(cleaned);
      setLastCharacterValid(isValid);
      
      if (!isValid) {
        setLiveAccuracyAnnouncement(`Digit mismatch on position ${cleaned.length}`);
      }
    } else {
      setLastCharacterValid(null);
    }

    // Auto-advance immediately upon entering all required digits
    if (cleaned.length === requiredDigits && requiredDigits > 0) {
      submitCurrentCard(cleaned);
    }
  };

  /**
   * Handle Enter key for manual immediate submission and Escape key to toggle abort/restart
   */
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typedValue.length > 0) {
        submitCurrentCard(typedValue);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (isConfirmingCancel) {
        onDismissCancel();
      } else {
        onInitiateCancel();
      }
    }
  };

  return (
    <div 
      className="lg:col-span-5 flex flex-col justify-between bg-white border border-slate-300 rounded-2xl p-6 shadow-sm relative overflow-hidden"
      id="isolated-typing-station"
    >
      {/* Live Accessibility Announcer for Screen Readers (ARIA live politeness) */}
      <div 
        className="sr-only" 
        role="status"
        aria-live="polite" 
        aria-atomic="true"
      >
        {liveAccuracyAnnouncement}
      </div>

      <div className="space-y-6">
        {/* Title card with Real-Time Card Index Indicator & Mistake Counter */}
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-indigo-900 bg-indigo-50 border border-indigo-300 px-3 py-1 rounded-xl font-mono shadow-2xs">
                Card {currentIndex + 1} / {totalCards}
              </span>
              <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-300 uppercase tracking-wider font-mono">
                🧾 TARGET NUMBER ({requiredDigits} DIGITS)
              </span>
            </div>

            {/* Mistakes status indicator */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <span 
                role="status"
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                  mistakesCount === 0
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : mistakesCount <= 2
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-rose-100 text-rose-900 border-rose-300 animate-pulse font-black'
                }`}
              >
                <AlertCircle className="w-3 h-3 text-current" width={12} height={12} aria-hidden="true" />
                <span>Mistakes: {mistakesCount} / 2 allowed {mistakesCount > 2 ? '⚠️ FAIL (Disqualified)' : ''}</span>
              </span>
            </div>
          </div>

          {!isConfirmingCancel ? (
            <button
              onClick={onInitiateCancel}
              title="Abort testing session (Shortcut: Esc)"
              aria-label="Abort testing session (Shortcut: Esc)"
              className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 hover:border-rose-400 rounded-lg text-xs font-bold tracking-wider uppercase cursor-pointer transition focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 focus-visible:outline-none shadow-2xs"
              id="abort-session-btn"
            >
              Cancel <span className="text-[9px] font-mono opacity-70 ml-0.5">(Esc)</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-800 font-bold uppercase tracking-wider font-sans">Abort?</span>
              <button
                onClick={onConfirmCancel}
                aria-label="Confirm aborting current typing session"
                className="px-2.5 py-1 bg-red-700 text-white hover:bg-red-800 rounded-lg text-xs font-bold uppercase cursor-pointer transition shrink-0 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:outline-none shadow-xs"
                id="confirm-abort-btn"
              >
                Yes
              </button>
              <button
                onClick={onDismissCancel}
                aria-label="Dismiss and continue typing session (Shortcut: Esc)"
                className="px-2.5 py-1 bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold uppercase cursor-pointer transition shrink-0 focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none shadow-2xs"
                id="cancel-abort-btn"
              >
                No <span className="text-[9px] font-mono opacity-70 ml-0.5">(Esc)</span>
              </button>
            </div>
          )}
        </div>

        {/* Visual stream progress line */}
        <div className="-mt-2">
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-indigo-600 to-teal-600 h-2 transition-all duration-200"
              style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Typing form input container - ISOLATED STATE */}
        <div className="space-y-3 relative">
          <label htmlFor="numeric-speed-input" id="numeric-speed-input-label" className="block text-xs font-extrabold text-slate-800 uppercase tracking-widest font-sans">
            {`TARGET NUMBER (${requiredDigits} DIGITS)`}
          </label>

          {/* Alphanumeric / Numeric Text Field with zero parent re-renders on keystroke */}
          <div className="relative">
            <input
              id="numeric-speed-input"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              role="progressbar"
              aria-labelledby="numeric-speed-input-label"
              aria-label={`Target Number Input ${typedValue.length} of ${requiredDigits} digits`}
              aria-valuenow={typedValue.length}
              aria-valuemin={0}
              aria-valuemax={requiredDigits}
              value={typedValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onPaste={onPasteBlocked}
              onCopy={onCopyBlocked}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={`Enter ${requiredDigits} digits`}
              className={`w-full py-4 px-5 text-center text-3xl font-bold tracking-[0.2em] font-mono text-slate-900 placeholder:text-slate-500 bg-slate-50 border focus:ring-4 outline-none rounded-xl transition ${
                lastCharacterValid === true ? 'border-emerald-600 focus:ring-emerald-100 bg-emerald-50/20 text-emerald-950' : 
                lastCharacterValid === false ? 'border-rose-600 focus:ring-rose-100 bg-rose-50/20 text-rose-950' : 'border-slate-350 focus:ring-indigo-100'
              }`}
            />

            {/* Character count ticks (Dynamic Progress Indicator) */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 flex items-center justify-center">
              <span className="text-[11px] font-bold font-mono text-slate-800 bg-white border border-slate-300 px-2 py-0.5 rounded tracking-wide shadow-2xs" id="input-progress-indicator">
                {typedValue.length} / {requiredDigits}
              </span>
            </div>
          </div>

          {/* Visual tick ribbon (Dynamic Dots) */}
          <div className="flex justify-center space-x-1 h-1.5 flex-wrap gap-y-1" aria-hidden="true">
            {Array.from({ length: requiredDigits }).map((_, idx) => {
              let dotColor = 'bg-slate-200 border border-slate-350';
              if (idx < typedValue.length) {
                if (lastCharacterValid === false && idx === typedValue.length - 1) {
                  dotColor = 'bg-rose-600 border border-rose-700';
                } else {
                  dotColor = 'bg-indigo-600 border border-indigo-700';
                }
              }
              return (
                <div 
                  key={idx} 
                  className={`w-3 h-1.5 rounded-full transition-colors ${dotColor}`} 
                />
              );
            })}
          </div>
        </div>

        {/* Entry specifications card with high-contrast text */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-700 font-sans">
          <span className="text-[11px] uppercase font-bold tracking-widest text-slate-800 block">
            Quick Entry Rules:
          </span>
          <ul className="space-y-1.5 text-xs leading-relaxed list-disc list-inside text-slate-700">
            <li>Enter <strong className="text-slate-900 font-mono font-bold">{requiredDigits} digits</strong> matching the card target value.</li>
            <li>Auto-advances immediately upon entering all {requiredDigits} digits.</li>
            <li>Press <strong className="text-slate-900 font-bold">Enter</strong> anytime to submit immediately.</li>
            <li>Click outside? Click <button onClick={() => inputRef.current?.focus()} className="text-indigo-700 hover:text-indigo-900 underline cursor-pointer font-bold focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none rounded">Refocus Input</button>.</li>
          </ul>
        </div>
      </div>

      {/* Left Time threshold bar */}
      <div className="mt-6 border-t border-slate-200 pt-3 flex justify-between items-center text-slate-700 text-xs font-mono font-bold">
        <span>Card {currentIndex + 1} of {totalCards}</span>
        <span>100-Card Mode</span>
      </div>
    </div>
  );
});

export default TypingInputStation;
