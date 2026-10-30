/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { GeneratedInvoiceData } from '../types';
import { renderReceiptToDataUrl } from '../utils/receiptGenerator';
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, Eye } from 'lucide-react';

interface InvoiceViewerProps {
  currentInvoice: GeneratedInvoiceData & { customImageUrl?: string; title?: string };
  onImageLoaded: () => void;
  isLoading: boolean;
}

/**
 * Accessible Invoice Viewer
 * 
 * Performance & A11y Standards:
 * - Fixes CLS by enforcing explicit 400x560 (aspect-ratio 400/560) dimension reserves.
 * - WCAG AA compliant color contrast (>= 4.5:1 body, >= 3:1 controls).
 * - Keyboard navigation (+/- to zoom, 0 to reset, C to cycle filters) with :focus-visible rings.
 */
export default function InvoiceViewer({ currentInvoice, onImageLoaded, isLoading }: InvoiceViewerProps) {
  const [imgUrl, setImgUrl] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [filterMode, setFilterMode] = useState<'normal' | 'high_contrast' | 'invert'>('normal');

  // Re-render when invoice changes
  useEffect(() => {
    if (currentInvoice.customImageUrl) {
      setImgUrl(currentInvoice.customImageUrl);
    } else {
      const url = renderReceiptToDataUrl(currentInvoice);
      setImgUrl(url);
    }
    // Reset zoom on index change
    setZoom(1);
  }, [currentInvoice]);

  const handleZoomIn = useCallback(() => setZoom(prev => Math.min(prev + 0.25, 2.0)), []);
  const handleZoomOut = useCallback(() => setZoom(prev => Math.max(prev - 0.25, 0.75)), []);
  const handleResetZoom = useCallback(() => setZoom(1), []);

  const cycleFilterMode = useCallback(() => {
    setFilterMode(prev => {
      if (prev === 'normal') return 'high_contrast';
      if (prev === 'high_contrast') return 'invert';
      return 'normal';
    });
  }, []);

  // Keyboard shortcut listener for viewer container
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing into an input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        cycleFilterMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleResetZoom, cycleFilterMode]);

  // Apply filters based on option choice for enhanced legibility
  const getFilterStyle = () => {
    switch (filterMode) {
      case 'high_contrast':
        return 'contrast-200 saturate-100 brightness-105 drop-shadow-md';
      case 'invert':
        return 'invert hue-rotate-180 brightness-95';
      default:
        return 'contrast-100 saturate-100 brightness-100';
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm"
      id="invoice-viewer-container"
    >
      {/* Viewer Header with High-Contrast WCAG AA Typography */}
      <div className="bg-slate-50 px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Eye className="w-4 h-4 text-indigo-700" width={16} height={16} aria-hidden="true" />
          <span className="text-xs font-extrabold text-slate-800 uppercase tracking-widest font-sans">
            Document View
          </span>
        </div>
        
        {/* Controls with accessible :focus-visible rings */}
        <div className="flex items-center gap-1.5" id="view-controls" role="toolbar" aria-label="Invoice image viewer controls">
          <button
            onClick={handleZoomOut}
            title="Zoom Out (-)"
            aria-label="Zoom out document (Shortcut: -)"
            className="p-1 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-bold transition text-xs flex items-center gap-1 border border-slate-300 shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <ZoomOut className="w-3.5 h-3.5 text-slate-700" width={14} height={14} aria-hidden="true" />
          </button>
          
          <button
            onClick={handleZoomIn}
            title="Zoom In (+)"
            aria-label="Zoom in document (Shortcut: +)"
            className="p-1 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-bold transition text-xs flex items-center gap-1 border border-slate-300 shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <ZoomIn className="w-3.5 h-3.5 text-slate-700" width={14} height={14} aria-hidden="true" />
          </button>

          {zoom !== 1 && (
            <button
              onClick={handleResetZoom}
              title="Reset Zoom (0)"
              aria-label="Reset zoom to 100% (Shortcut: 0)"
              className="p-1 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold transition text-xs flex items-center gap-1 border border-indigo-200 shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 focus-visible:outline-none"
            >
              <RotateCcw className="w-3 h-3 text-indigo-800" width={12} height={12} aria-hidden="true" />
              <span className="text-[10px] font-mono">{Math.round(zoom * 100)}%</span>
            </button>
          )}
          
          <div className="h-4 w-[1px] bg-slate-300 mx-1" aria-hidden="true" />

          {/* Contrast Mode Selector conforming to WCAG AA High Contrast */}
          <div className="flex items-center gap-1" role="group" aria-label="Image contrast filter mode">
            <button
              onClick={() => setFilterMode('normal')}
              aria-pressed={filterMode === 'normal'}
              aria-label="Standard natural contrast"
              className={`p-1 px-2 text-[10px] uppercase font-extrabold rounded-lg border cursor-pointer transition shadow-2xs focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 focus-visible:outline-none ${
                filterMode === 'normal' 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Std
            </button>
            <button
              onClick={() => setFilterMode('high_contrast')}
              aria-pressed={filterMode === 'high_contrast'}
              aria-label="High contrast monochrome filter"
              className={`p-1 px-2 text-[10px] uppercase font-extrabold rounded-lg border cursor-pointer transition shadow-2xs focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 focus-visible:outline-none ${
                filterMode === 'high_contrast' 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Mono
            </button>
            <button
              onClick={() => setFilterMode('invert')}
              aria-pressed={filterMode === 'invert'}
              aria-label="Invert dark mode contrast filter"
              className={`p-1 px-2 text-[10px] uppercase font-extrabold rounded-lg border cursor-pointer transition shadow-2xs focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 focus-visible:outline-none ${
                filterMode === 'invert' 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Invert
            </button>
          </div>
        </div>
      </div>

      {/* Image Render Area - Zero CLS with fixed aspect ratio box */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-200 relative overflow-auto min-h-[380px] sm:min-h-[460px]">
        {isLoading ? (
          <div 
            className="w-full max-w-[400px] aspect-[400/560] bg-slate-300/60 rounded-xl flex flex-col items-center justify-center space-y-3 animate-pulse border border-slate-350"
            style={{ aspectRatio: '400 / 560' }}
            role="status"
            aria-live="polite"
          >
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-700 border-t-transparent" />
            <span className="text-xs font-bold text-slate-800 font-sans">Buffering invoice scan...</span>
          </div>
        ) : (
          <div 
            className="w-full max-w-[400px] aspect-[400/560] flex items-center justify-center relative transition-transform duration-200 shrink-0" 
            style={{ transform: `scale(${zoom})`, aspectRatio: '400 / 560' }}
          >
            {imgUrl ? (
              <img
                src={imgUrl}
                alt="Japanese Qualified Invoice Receipt Scan"
                width={400}
                height={560}
                onLoad={onImageLoaded}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-contain border border-slate-400 rounded-lg shadow-xl ${getFilterStyle()}`}
                style={{ aspectRatio: '400 / 560', imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="text-slate-700 flex flex-col items-center p-6 bg-white rounded-xl border border-slate-300 shadow-sm">
                <AlertTriangle className="w-10 h-10 text-amber-600 mb-2" width={40} height={40} aria-hidden="true" />
                <span className="text-xs font-bold text-slate-800">Error rendering image scan.</span>
              </div>
            )}
          </div>
        )}

        {/* Floating difficulty badge */}
        <div className="absolute top-4 left-4" id="image-quality-indicators">
          <span className={`text-[10px] ${
            currentInvoice.customImageUrl 
              ? 'bg-indigo-100 text-indigo-900 border border-indigo-300' 
              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
          } font-extrabold uppercase px-2.5 py-0.5 rounded-md tracking-wider shadow-2xs`}>
            {currentInvoice.customImageUrl ? 'Custom Upload' : 'Live Load Mode'}
          </span>
        </div>
      </div>

      {/* Mini Helper Footer with WCAG AA High Contrast */}
      <div className="bg-slate-900 text-slate-300 text-[10px] uppercase tracking-[0.2em] flex justify-between items-center p-3.5 px-5 font-mono select-none">
        <span className="text-slate-300 font-semibold">PRELOADING NEXT BUFFER // IMAGE DATA:</span>
        <span className="text-white font-bold truncate max-w-[280px]">
          {currentInvoice.title 
            ? currentInvoice.title.toUpperCase()
            : currentInvoice.customImageUrl 
            ? `ADMIN_CUSTOM_${currentInvoice.id.toUpperCase().slice(-16)}.PNG`
            : `IMG_${currentInvoice.id.toUpperCase().slice(-16)}.PNG`
          }
        </span>
      </div>
    </div>
  );
}
