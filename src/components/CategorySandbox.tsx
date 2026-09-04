/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  FileImage,
  FileText,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit,
  Zap,
  Play,
  Trophy,
  Bookmark,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Check
} from 'lucide-react';
import { GeneratedInvoiceData, TrainingCategory, TrainingMode } from '../types';
import { supabase } from '../supabase';

export interface PoolItem extends GeneratedInvoiceData {
  customImageUrl?: string;
  title: string;
  target: string;
  issuer: string;
  isSynced?: boolean;
  matchedFromCsv?: boolean;
  matchedIdentifier?: string;
}

interface CategorySandboxProps {
  category: TrainingCategory;
  invoices: (GeneratedInvoiceData & { customImageUrl?: string; title?: string })[];
  onUploadImages: (files: FileList | File[], category: TrainingCategory) => Promise<void>;
  onAddSample: (category: TrainingCategory) => void;
  onDeleteInvoice: (id: string) => void;
  onUpdateCode: (id: string, newCode: string) => void;
  onUpdateCompany: (id: string, newCompany: string) => void;
  onClearPool: (category: TrainingCategory) => void;
  onOpenLabelingModal: (indexInAll: number) => void;
  allInvoices: (GeneratedInvoiceData & { customImageUrl?: string })[];
  onStartTest: (category: TrainingCategory, mode: TrainingMode) => void;
  uploadProgressError: string | null;
  customExpectedCode: string;
  setCustomExpectedCode: (val: string) => void;
  customCompanyName: string;
  setCustomCompanyName: (val: string) => void;
  isAdmin?: boolean;
  onRefreshPool?: () => Promise<void>;
  isRefreshingPool?: boolean;
}

// 1. Helper to extract clean image title/identifier consistently
export const getItemTitle = (item: any): string => {
  if (!item) return '';
  const raw = item.title || item.name || item.companyName || item.id || '';
  return String(raw).trim();
};

// 2. Robust Normalized Matching Helper:
// Strip file extensions, trim spaces, strip leading zeros, convert to lowercase
export const normalizeKey = (val: string): string => {
  if (!val) return '';
  const cleaned = String(val)
    .replace(/\.(jpe?g|png|webp|gif|bmp|svg)$/i, '')
    .trim()
    .toLowerCase();
  const noLeadingZeros = cleaned.replace(/^0+/, '');
  return noLeadingZeros || cleaned;
};

// 3. Category-Aware Target Cleaning Helper:
// For tax_number: converts full-width numbers, strips leading "T"/"t", ensures pure numeric digits only
export const cleanEnteredTarget = (raw: string, cat: TrainingCategory): string => {
  const val = (raw || '').trim();
  if (cat === 'tax_number') {
    let tax = val.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    tax = tax.replace(/^T/i, '');
    tax = tax.replace(/\D/g, '');
    return tax;
  }
  if (cat === 'date_number') {
    let dateStr = val.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const dateParts = dateStr.split(/[/.\-年日月\s]+/).filter(Boolean);
    if (dateParts.length >= 3 && dateParts[0].length === 4) {
      const y = dateParts[0];
      const m = dateParts[1].padStart(2, '0');
      const d = dateParts[2].padStart(2, '0');
      return `${y}${m}${d}`;
    }
    return dateStr.replace(/\D/g, '');
  }
  if (cat === 'phone_number') {
    let phone = val.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    return phone.replace(/[ー－―]/g, '-').replace(/\s+/g, '').trim();
  }
  return val;
};

export const CategorySandbox: React.FC<CategorySandboxProps> = ({
  category,
  invoices,
  onUploadImages,
  onAddSample,
  onDeleteInvoice,
  onUpdateCode,
  onUpdateCompany,
  onClearPool,
  onStartTest,
  uploadProgressError,
  customExpectedCode,
  setCustomExpectedCode,
  customCompanyName,
  setCustomCompanyName,
  isAdmin = false,
  onRefreshPool,
  isRefreshingPool = false
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [showPoolCatalog, setShowPoolCatalog] = useState<boolean>(false);
  const [reviewerModalIndex, setReviewerModalIndex] = useState<number | null>(null);
  const [matchedCsvMap, setMatchedCsvMap] = useState<Record<string, string>>({});

  // Active state 'poolItems' with complete hydration and persistence metadata
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // Modal temporary edit state
  const [modalTarget, setModalTarget] = useState<string>('');
  const [modalIssuer, setModalIssuer] = useState<string>('');
  const [isSavingCode, setIsSavingCode] = useState<boolean>(false);

  // Toast & Feedback State
  interface ToastFeedback {
    type: 'success' | 'warning' | 'error';
    message: string;
    unmatched?: string[];
  }
  const [toastFeedback, setToastFeedback] = useState<ToastFeedback | null>(null);

  // Auto-dismiss toast feedback after 6 seconds
  useEffect(() => {
    if (toastFeedback) {
      const timer = setTimeout(() => {
        setToastFeedback(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toastFeedback]);

  // 3. Natural Sort:
  // Maintain natural alphanumeric sort for all pool items so that item '2' comes before '10'
  const sortedPoolItems = useMemo(() => {
    return [...poolItems].sort((a, b) => {
      const titleA = a.title || getItemTitle(a);
      const titleB = b.title || getItemTitle(b);
      return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [poolItems]);

  /**
   * 2. Auto-Hydrate Targets on Image Pool Load:
   * - In 'loadPoolImages' (or whenever images are fetched from Supabase storage or set):
   *   * Fetch saved targets from Supabase table 'training_labels' for the current category:
   *     const { data: dbLabels } = await supabase.from('training_labels').select('*').eq('category', category);
   *   * Create a lookup map: key = normalizeKey(row.image_identifier), value = row.expected_value.
   *   * Map each pool item: if lookup map has the key, set item.target = value and item.issuer = row.issuer_or_note.
   *   * Fallback to LocalStorage cache if Supabase table has not yet loaded.
   */
  const loadPoolImages = async (sourceInvoices: (GeneratedInvoiceData & { customImageUrl?: string; title?: string })[]) => {
    const cacheKey = `training_labels_cache_${category}`;
    let localCache: Record<string, { expected_value: string; issuer_or_note?: string }> = {};

    // Step A: Immediately apply LocalStorage cache fallback (zero network latency)
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        localCache = JSON.parse(cachedRaw);
      }
    } catch (e) {
      console.warn('[Auto-Hydrate] Failed to read local storage cache:', e);
    }

    const initialMappedItems: PoolItem[] = sourceInvoices.map((inv) => {
      const title = getItemTitle(inv);
      const normKey = normalizeKey(title);
      const cached = localCache[normKey];
      const targetVal = cached?.expected_value
        ? cleanEnteredTarget(cached.expected_value, category)
        : cleanEnteredTarget(inv.expectedNumber || '', category);
      const issuerVal = (cached?.issuer_or_note !== undefined ? cached.issuer_or_note : inv.companyName) || '';

      return {
        ...inv,
        title,
        target: targetVal,
        expectedNumber: targetVal,
        issuer: issuerVal,
        companyName: issuerVal || inv.companyName,
        isSynced: !!cached
      };
    });

    setPoolItems(initialMappedItems);

    // Step B: Fetch saved targets from Supabase table 'training_labels' for the current category
    try {
      const { data: dbLabels, error } = await supabase
        .from('training_labels')
        .select('*')
        .eq('category', category);

      if (!error && Array.isArray(dbLabels)) {
        // Create lookup map: key = normalizeKey(row.image_identifier), value = row.expected_value
        const lookupMap = new Map<string, { expected_value: string; issuer_or_note?: string }>();
        const newCache: Record<string, { expected_value: string; issuer_or_note?: string }> = { ...localCache };

        dbLabels.forEach((row: any) => {
          if (row.image_identifier) {
            const key = normalizeKey(row.image_identifier);
            const cleanVal = cleanEnteredTarget(row.expected_value || '', category);
            lookupMap.set(key, {
              expected_value: cleanVal,
              issuer_or_note: row.issuer_or_note || ''
            });
            newCache[key] = {
              expected_value: cleanVal,
              issuer_or_note: row.issuer_or_note || ''
            };
          }
        });

        // Update LocalStorage cache with the complete remote set
        try {
          localStorage.setItem(cacheKey, JSON.stringify(newCache));
        } catch (e) {
          console.warn('[Auto-Hydrate] Failed to update localStorage mirror cache:', e);
        }

        // Map each pool item: if lookup map has the key, set item.target = value and item.issuer = row.issuer_or_note
        setPoolItems((prevItems) => {
          return prevItems.map((item) => {
            const itemKey = normalizeKey(item.title || getItemTitle(item));
            if (lookupMap.has(itemKey)) {
              const record = lookupMap.get(itemKey)!;
              const cleanVal = record.expected_value;
              const issuerVal = record.issuer_or_note || item.issuer;

              if (cleanVal !== item.expectedNumber) {
                onUpdateCode(item.id, cleanVal);
              }
              if (record.issuer_or_note && record.issuer_or_note !== item.companyName && onUpdateCompany) {
                onUpdateCompany(item.id, record.issuer_or_note);
              }

              return {
                ...item,
                target: cleanVal,
                expectedNumber: cleanVal,
                issuer: issuerVal,
                companyName: issuerVal || item.companyName,
                isSynced: true
              };
            }
            return item;
          });
        });
      }
    } catch (err) {
      console.warn('[Auto-Hydrate] Operating offline, fallback cache remains active:', err);
    }
  };

  // Run auto-hydration whenever the category or source invoices change
  useEffect(() => {
    loadPoolImages(invoices);
  }, [category, invoices]);

  /**
   * 1. Persistent Storage Integration on Save:
   * In 'handleSaveVerifyCode':
   *   * Clean the entered target (if category === 'tax_number', strip any leading "T"/"t" and ensure pure numeric digits).
   *   * Update the active state 'poolItems'.
   *   * Immediately persist to Supabase:
   *     await supabase.from('training_labels').upsert({
   *       category: category,
   *       image_identifier: normalizeKey(reviewingItem.title),
   *       expected_value: cleanTarget,
   *       issuer_or_note: issuerNote.trim()
   *     }, { onConflict: 'category,image_identifier' });
   *   * Also update a LocalStorage mirror (`training_labels_cache_${category}`) so that targets persist even across full page reloads without network latency.
   */
  const handleSaveVerifyCode = async (
    targetInput: string,
    issuerInput: string,
    itemToSave?: PoolItem
  ) => {
    const reviewingItem = itemToSave || (reviewerModalIndex !== null ? sortedPoolItems[reviewerModalIndex] : null);
    if (!reviewingItem) return;

    setIsSavingCode(true);

    // Clean entered target
    const cleanTarget = cleanEnteredTarget(targetInput, category);
    const issuerNote = (issuerInput || '').trim();
    const itemTitle = reviewingItem.title || getItemTitle(reviewingItem);
    const normalizedKey = normalizeKey(itemTitle);

    // Update active state 'poolItems'
    setPoolItems((prev) =>
      prev.map((item) => {
        if (item.id === reviewingItem.id) {
          return {
            ...item,
            target: cleanTarget,
            expectedNumber: cleanTarget,
            issuer: issuerNote,
            companyName: issuerNote || item.companyName,
            isSynced: true
          };
        }
        return item;
      })
    );

    // Propagate to parent state
    onUpdateCode(reviewingItem.id, cleanTarget);
    if (onUpdateCompany) {
      onUpdateCompany(reviewingItem.id, issuerNote);
    }

    // Update LocalStorage mirror (`training_labels_cache_${category}`)
    const cacheKey = `training_labels_cache_${category}`;
    try {
      const rawCache = localStorage.getItem(cacheKey);
      const cacheMap: Record<string, { expected_value: string; issuer_or_note?: string }> = rawCache ? JSON.parse(rawCache) : {};
      cacheMap[normalizedKey] = {
        expected_value: cleanTarget,
        issuer_or_note: issuerNote
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheMap));
    } catch (e) {
      console.warn('Failed to update local cache mirror:', e);
    }

    // Immediately persist to Supabase
    try {
      const { error } = await supabase.from('training_labels').upsert({
        category: category,
        image_identifier: normalizeKey(reviewingItem.title),
        expected_value: cleanTarget,
        issuer_or_note: issuerNote.trim()
      }, { onConflict: 'category,image_identifier' });

      if (error) {
        console.warn('Supabase upsert warning:', error);
        setToastFeedback({
          type: 'warning',
          message: 'ကွန်ရက်မရရှိပါသဖြင့် အချက်အလက်ကို သင့်စက်တွင်း (Local Cache) ၌သာ သိမ်းဆည်းထားပါသည်။'
        });
      } else {
        setLastSavedId(reviewingItem.id);
        setToastFeedback({
          type: 'success',
          message: 'သတ်မှတ်တန်ဖိုးကို Database တွင် အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။'
        });
      }
    } catch (err) {
      console.warn('Network offline or error during Supabase upsert:', err);
      setToastFeedback({
        type: 'warning',
        message: 'ကွန်ရက်မရရှိပါသဖြင့် အချက်အလက်ကို သင့်စက်တွင်း (Local Cache) ၌သာ သိမ်းဆည်းထားပါသည်။'
      });
    } finally {
      setIsSavingCode(false);
    }
  };

  // Keep modal input fields in sync with the currently active reviewed item
  const activeReviewItem = reviewerModalIndex !== null && sortedPoolItems[reviewerModalIndex]
    ? sortedPoolItems[reviewerModalIndex]
    : null;
  const activeReviewItemId = activeReviewItem ? activeReviewItem.id : null;

  useEffect(() => {
    if (activeReviewItem) {
      const initialTarget = category === 'tax_number'
        ? (activeReviewItem.target || activeReviewItem.expectedNumber || '').replace(/^T/i, '')
        : (activeReviewItem.target || activeReviewItem.expectedNumber || '');
      setModalTarget(initialTarget);
      setModalIssuer(activeReviewItem.issuer || activeReviewItem.companyName || '');
    }
  }, [activeReviewItemId, category]);

  /**
   * Template Generator Logic (downloadCsvTemplate):
   * - Generates standard CSV with UTF-8 BOM ("\uFEFF").
   * - Headers: "Image_Identifier,Expected_Value,Category,Issuer_Or_Note".
   */
  const downloadCsvTemplate = () => {
    const escapeCsv = (field: unknown): string => {
      if (field === null || field === undefined) return '';
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Image_Identifier',
      category === 'tax_number' ? 'Expected_Value_13Digits_NoT' : 'Expected_Value',
      'Category',
      'Issuer_Or_Note'
    ];
    const rows: string[] = [headers.join(',')];

    if (sortedPoolItems.length > 0) {
      sortedPoolItems.forEach((inv) => {
        const rawTitle = inv.title || inv.matchedIdentifier || getItemTitle(inv);
        const cleanTitle = rawTitle.replace(/\.(jpe?g|png|webp|gif|bmp|svg)$/i, '').trim();
        const expectedVal = cleanEnteredTarget(inv.target || inv.expectedNumber || '', category);
        const cat = inv.category || category;
        const note = inv.issuer || inv.companyName || inv.note || '';

        rows.push([
          escapeCsv(cleanTitle),
          escapeCsv(expectedVal),
          escapeCsv(cat),
          escapeCsv(note)
        ].join(','));
      });
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `label_template_${category}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * CSV Parser & Bulk Matcher (handleCsvImport):
   * Imports labels and updates both active state, LocalStorage mirror, and Supabase.
   */
  const handleCsvImport = async (file: File) => {
    try {
      const text = await file.text();
      const cleanText = text.replace(/^\uFEFF/, '');
      
      const parsedRows: string[][] = [];
      let currentRow: string[] = [];
      let currentField = '';
      let insideQuotes = false;

      for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            currentField += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === ',' && !insideQuotes) {
          currentRow.push(currentField.trim());
          currentField = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
          if (char === '\r' && nextChar === '\n') {
            i++;
          }
          currentRow.push(currentField.trim());
          if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
            parsedRows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          parsedRows.push(currentRow);
        }
      }

      if (parsedRows.length === 0) {
        setToastFeedback({
          type: 'error',
          message: 'CSV ဖိုင်တွင် ဒေတာ အချက်အလက် မရှိပါ။ (Uploaded CSV is empty)'
        });
        return;
      }

      const firstRowNorm = parsedRows[0].map(h => h.toLowerCase().replace(/[\s_\-]+/g, ''));
      const hasHeader = firstRowNorm.some(h =>
        h.includes('identifier') || h.includes('image') || h.includes('expect') || h.includes('target') || h.includes('value') || h.includes('code') || h === 'title' || h === 'id'
      );

      let idCol = 0;
      let valCol = 1;
      let noteCol = 3;
      let dataRows = parsedRows;

      if (hasHeader) {
        idCol = firstRowNorm.findIndex(h =>
          h.includes('identifier') || h.includes('image') || h.includes('file') || h === 'title' || h === 'id' || h === 'name'
        );
        valCol = firstRowNorm.findIndex(h =>
          h.includes('expect') || h.includes('target') || h.includes('value') || h.includes('code') || h.includes('number')
        );
        noteCol = firstRowNorm.findIndex(h =>
          h.includes('issuer') || h.includes('note') || h.includes('company') || h.includes('store')
        );

        if (idCol === -1) idCol = 0;
        if (valCol === -1) valCol = 1;
        dataRows = parsedRows.slice(1);
      }

      let updatedCount = 0;
      const unmatchedIdentifiers: string[] = [];
      const newMatchedMap: Record<string, string> = { ...matchedCsvMap };
      const cacheUpdates: Record<string, { expected_value: string; issuer_or_note?: string }> = {};
      const upsertDbRows: any[] = [];

      dataRows.forEach((row) => {
        const rawIdentifier = (row[idCol] || '').trim();
        const rawExpectedVal = (row[valCol] || '').trim();
        const rawNote = noteCol !== -1 && row[noteCol] ? row[noteCol].trim() : '';

        if (!rawIdentifier) return;
        const normalizedRowKey = normalizeKey(rawIdentifier);

        const matchedItem = sortedPoolItems.find((inv) => {
          const itemTitle = inv.title || getItemTitle(inv);
          return normalizeKey(itemTitle) === normalizedRowKey;
        });

        if (matchedItem) {
          const cleanVal = cleanEnteredTarget(rawExpectedVal, category);
          const noteVal = rawNote || matchedItem.issuer || matchedItem.companyName || '';

          onUpdateCode(matchedItem.id, cleanVal);
          if (rawNote && onUpdateCompany) {
            onUpdateCompany(matchedItem.id, rawNote);
          }

          newMatchedMap[matchedItem.id] = rawIdentifier;
          matchedItem.target = cleanVal;
          matchedItem.expectedNumber = cleanVal;
          matchedItem.issuer = noteVal;
          matchedItem.companyName = noteVal;
          matchedItem.isSynced = true;
          matchedItem.matchedFromCsv = true;
          matchedItem.matchedIdentifier = rawIdentifier;

          const normKey = normalizeKey(matchedItem.title || getItemTitle(matchedItem));
          cacheUpdates[normKey] = {
            expected_value: cleanVal,
            issuer_or_note: noteVal
          };

          upsertDbRows.push({
            category: category,
            image_identifier: normKey,
            expected_value: cleanVal,
            issuer_or_note: noteVal
          });

          updatedCount++;
        } else {
          unmatchedIdentifiers.push(rawIdentifier);
        }
      });

      setMatchedCsvMap(newMatchedMap);

      // Persist bulk CSV updates to LocalStorage cache
      const cacheKey = `training_labels_cache_${category}`;
      try {
        const rawCache = localStorage.getItem(cacheKey);
        const existingCache = rawCache ? JSON.parse(rawCache) : {};
        localStorage.setItem(cacheKey, JSON.stringify({ ...existingCache, ...cacheUpdates }));
      } catch (e) {
        console.warn('Failed to save CSV updates to localStorage cache:', e);
      }

      // Persist bulk CSV updates to Supabase
      if (upsertDbRows.length > 0) {
        try {
          await supabase.from('training_labels').upsert(upsertDbRows, { onConflict: 'category,image_identifier' });
        } catch (err) {
          console.warn('Failed to upsert CSV labels to Supabase:', err);
        }
      }

      const totalImages = sortedPoolItems.length;

      if (updatedCount > 0) {
        setToastFeedback({
          type: 'success',
          message: `အောင်မြင်စွာ ချိတ်ဆက်ပြီးပါပြီ။ စုစုပေါင်း ${updatedCount}/${totalImages} ပုံအတွက် သတ်မှတ်တန်ဖိုးများကို တိကျစွာ သတ်မှတ်ပြီးပါပြီ။`,
          unmatched: unmatchedIdentifiers.length > 0 ? unmatchedIdentifiers : undefined
        });
      } else {
        setToastFeedback({
          type: 'error',
          message: `CSV ဖိုင်မှ ပုံအမည်များနှင့် Active Pool ရှိ ပုံများ ကိုက်ညီမှု မရှိပါ။ (${unmatchedIdentifiers.length} ခု မတွေ့ရှိပါ)`,
          unmatched: unmatchedIdentifiers
        });
      }
    } catch (err: any) {
      console.error('[CSV Import Error]', err);
      setToastFeedback({
        type: 'error',
        message: `CSV ဖတ်ရှုရာတွင် ချို့ယွင်းချက် ဖြစ်ပေါ်ပါသည်: ${err?.message || 'Invalid CSV format'}`
      });
    }
  };

  // Category Configuration Meta
  const config = {
    tax_number: {
      title: '🧾 Tax Number Data Entry (登録番号)',
      subtitle: 'Transcribe 13-digit Japanese Qualified Invoice Tax Registration Numbers from receipt images.',
      inputRule: 'Enter 13 numeric digits (without \'T\'). Hyphens are skipped.',
      autoAdvance: 'Auto-advances immediately upon typing 13 numeric digits.',
      slaTarget: 'Target speed is under 6.00 seconds per invoice with ≥ 95% accuracy.',
      codePlaceholder: '1234567890123',
      codeLabel: 'Registration Tax Code (13 numeric digits)',
      extractHint: 'Filename auto-detects 13 numeric digits (e.g. receipt_1234567890123.jpg or receipt_T1234567890123.jpg)',
      slaLimit: '6.00s'
    },
    date_number: {
      title: '📅 Date Number Data Entry (発行年月日 / 取引日)',
      subtitle: 'Transcribe 8-digit Japanese Invoice Transaction Dates (YYYYMMDD) from receipt images.',
      inputRule: 'Enter 8 numeric digits in YYYYMMDD format (e.g. 20260522 for 2026年5月22日).',
      autoAdvance: 'Auto-advances immediately upon reaching exactly 8 numeric digits.',
      slaTarget: 'Target speed is under 4.00 seconds per invoice with ≥ 95% accuracy.',
      codePlaceholder: '20260522',
      codeLabel: '8-Digit Date (YYYYMMDD)',
      extractHint: 'Filename auto-detects 8-digit dates (e.g. receipt_20260522.jpg)',
      slaLimit: '4.00s'
    },
    phone_number: {
      title: '📞 Phone Number Data Entry (電話番号 / TEL)',
      subtitle: 'Transcribe Japanese Contact Telephone Numbers (10 to 11 digits) from receipt images.',
      inputRule: 'Enter numeric digits only (e.g. 0312345678 or 09012345678). Hyphens are automatically stripped.',
      autoAdvance: 'Auto-advances immediately upon matching the expected telephone digit length (10 or 11 digits).',
      slaTarget: 'Target speed is under 5.00 seconds per invoice with ≥ 95% accuracy.',
      codePlaceholder: '0312345678',
      codeLabel: 'Phone Number (10-11 digits)',
      extractHint: 'Filename auto-detects telephone sequences (e.g. receipt_0312345678.jpg)',
      slaLimit: '5.00s'
    }
  }[category];

  const handleFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    try {
      await onUploadImages(files, category);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id={`category-sandbox-${category}`}>
      {/* 1. Category Header & Guidelines */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2 font-sans">
              {config.title}
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5 leading-relaxed">
              {config.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-full shrink-0">
              SLA Standard: &lt; {config.slaLimit}
            </span>
            {showRules ? (
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
                aria-expanded={true}
              >
                ✕ Hide Rules
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
                aria-expanded={false}
              >
                📖 Show Entry Rules & SLA Guidelines
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guidelines Cards (Collapsible) */}
      {showRules && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-4 bg-slate-50/90 rounded-2xl border border-slate-200 shadow-2xs transition-all duration-200 animate-fade-in">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-indigo-600" /> 1. Input Rule
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              {config.inputRule}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-pink-500" /> 2. Auto-Advance
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              {config.autoAdvance}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-indigo-600" /> 3. Performance Timing
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Timing starts precisely when the image displays on screen (<code className="font-mono text-[11px] bg-slate-50 px-1 rounded border border-slate-200">onLoad</code>) and records on final keystroke.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" /> 4. SLA Benchmark
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              {config.slaTarget}
            </p>
          </div>
        </div>
      )}

      {/* Global Toast Feedback Notification */}
      {toastFeedback && (
        <div 
          className={`p-3 rounded-xl text-xs flex items-start justify-between gap-2 border shadow-2xs transition-all animate-fade-in ${
            toastFeedback.type === 'success' 
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
              : toastFeedback.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
          role="alert"
        >
          <div className="flex items-start gap-2">
            {toastFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${toastFeedback.type === 'warning' ? 'text-amber-600' : 'text-rose-600'}`} />
            )}
            <div className="space-y-1">
              <p className="font-semibold text-xs leading-relaxed">{toastFeedback.message}</p>
              {toastFeedback.unmatched && toastFeedback.unmatched.length > 0 && (
                <p className="text-[11px] opacity-90 font-mono leading-tight">
                  သတိပေးချက်: Active Pool တွင် မတွေ့ရှိသော ပုံအမည်များ ({toastFeedback.unmatched.length} ခု):{' '}
                  <span className="font-bold">
                    {toastFeedback.unmatched.slice(0, 4).join(', ')}
                    {toastFeedback.unmatched.length > 4 ? ` (+${toastFeedback.unmatched.length - 4} ခု)` : ''}
                  </span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToastFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer transition shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Admin Upload Pool Section OR Trainee Verified Status Banner */}
      {isAdmin ? (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-3 gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600 font-bold" /> Upload Custom Images for Training Pool
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {config.extractHint}
              </p>
            </div>
            <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Admin Upload Console
            </span>
          </div>

          {uploadProgressError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadProgressError}</span>
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png, image/jpeg, image/webp"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">
                  {isUploading ? 'Processing uploaded files...' : 'Click to browse or drop invoice images here'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Supports multiple JPG, PNG, WEBP files (Max 3MB each).
                </p>
              </div>
            </div>
          </div>

          {/* Optional Defaults Override */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Fallback Expected Code (If filename doesn't contain code)
              </label>
              <input
                type="text"
                placeholder={config.codePlaceholder}
                value={customExpectedCode}
                onChange={(e) => setCustomExpectedCode(category === 'tax_number' ? e.target.value.replace(/^T/i, '') : e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-none focus:border-indigo-500 font-mono font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {category === 'tax_number' ? "Enter 13 numeric digits (without 'T')" : `Format: ${config.codeLabel}`}
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Fallback Issuer / Store Name
              </label>
              <input
                type="text"
                placeholder="e.g. Aeon Retail Co., Ltd."
                value={customCompanyName}
                onChange={(e) => setCustomCompanyName(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Catalog List of Loaded Images (Admin Editable) */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1">
                <FileImage className="w-3.5 h-3.5 text-indigo-600" /> Active Pool Images ({sortedPoolItems.length})
              </span>
              
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* Two-Way Standard CSV Label Template Management Buttons */}
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="text-[9px] bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs"
                  title="Download standard CSV label template pre-populated with active pool images"
                  aria-label="Download CSV Template"
                >
                  <Download className="w-3 h-3 text-indigo-600" />
                  <span>Download CSV Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  className="text-[9px] bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs"
                  title="Import CSV labels to batch update expected transcription values"
                  aria-label="Import CSV Labels"
                >
                  <Upload className="w-3 h-3 text-emerald-600" />
                  <span>Import CSV Labels</span>
                </button>

                {/* Hidden CSV file input */}
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv, text/csv, application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleCsvImport(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />

                {onRefreshPool && (
                  <button
                    onClick={async () => {
                      if (onRefreshPool) await onRefreshPool();
                      loadPoolImages(invoices);
                    }}
                    disabled={isRefreshingPool}
                    className="text-[9px] bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
                    title="Force refresh custom invoice pool from Supabase"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingPool ? 'animate-spin text-indigo-600' : ''}`} />
                    <span>Sync/Refresh Pool</span>
                  </button>
                )}
                <button
                  onClick={() => onAddSample(category)}
                  className="text-[9px] bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Populate Sample Image
                </button>
                {sortedPoolItems.length > 0 && (
                  <button
                    onClick={() => {
                      onClearPool(category);
                      setPoolItems([]);
                    }}
                    className="text-[9px] hover:bg-rose-50 border border-transparent text-rose-600 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider"
                  >
                    Clear Pool
                  </button>
                )}
              </div>
            </div>

            {sortedPoolItems.length === 0 ? (
              <div className="border border-slate-200 rounded-xl p-6 text-center bg-white">
                <p className="text-slate-400 text-xs font-semibold">No images in this category pool yet</p>
                <p className="text-[10px] text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Drop your receipt image files above or click <strong className="text-indigo-600 cursor-pointer hover:underline" onClick={() => onAddSample(category)}>Populate Sample Image</strong> to immediately test with generated receipts!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                {sortedPoolItems.map((inv, idx) => {
                  const isMatchedFromCsv = !!(matchedCsvMap[inv.id] || inv.matchedFromCsv);
                  const displayTitle = matchedCsvMap[inv.id] || inv.matchedIdentifier || inv.title || getItemTitle(inv);
                  const isItemSynced = inv.isSynced || lastSavedId === inv.id;

                  return (
                    <div key={inv.id} className="flex bg-white border border-slate-200 rounded-lg p-2 items-center justify-between group hover:border-indigo-300 transition relative">
                      <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-1">
                        {/* Thumbnail with Zoom */}
                        <div 
                          onClick={() => setReviewerModalIndex(idx)}
                          className="w-12 h-10 border border-slate-200 rounded bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative group-hover:border-indigo-300 shadow-sm"
                          title="Click to zoom & review in modal"
                        >
                          {inv.customImageUrl ? (
                            <img
                              src={inv.customImageUrl}
                              alt="Invoice thumbnail"
                              loading="lazy"
                              decoding="async"
                              className="object-cover w-full h-full group-hover:scale-105 transition duration-150"
                            />
                          ) : (
                            <FileImage className="w-5 h-5 text-slate-400" />
                          )}
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center justify-center">
                            <Plus className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                        
                        {/* Inline Editable Fields */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <input
                              type="text"
                              value={inv.issuer || inv.companyName || ''}
                              placeholder="Issuer Name"
                              onChange={(e) => {
                                const val = e.target.value;
                                setPoolItems(prev => prev.map(p => p.id === inv.id ? { ...p, issuer: val, companyName: val } : p));
                              }}
                              onBlur={(e) => {
                                handleSaveVerifyCode(inv.target || inv.expectedNumber || '', e.target.value, inv);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-full text-[10px] font-bold text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0.5 outline-none transition"
                              title="Click to edit issuer name (auto-persists on blur/Enter)"
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              {isItemSynced && (
                                <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 py-0.2 rounded font-bold" title="Synced to DB">
                                  ☁️
                                </span>
                              )}
                              {isMatchedFromCsv && (
                                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-1.5 py-0.2 rounded shrink-0">
                                  CSV
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pl-1">
                            <span className="text-[9px] text-indigo-600 font-mono font-bold shrink-0">Target:</span>
                            <input
                              type="text"
                              value={category === 'tax_number' ? (inv.target || inv.expectedNumber || '').replace(/^T/i, '') : (inv.target || inv.expectedNumber || '')}
                              onChange={(e) => {
                                const val = category === 'tax_number' ? e.target.value.replace(/^T/i, '') : e.target.value;
                                setPoolItems(prev => prev.map(p => p.id === inv.id ? { ...p, target: val, expectedNumber: val } : p));
                              }}
                              onBlur={(e) => {
                                handleSaveVerifyCode(e.target.value, inv.issuer || inv.companyName || '', inv);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-full text-[10px] font-mono text-indigo-700 bg-transparent hover:bg-slate-50 focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0.5 outline-none font-bold transition tracking-wider uppercase"
                              title="Click to edit expected transcribed number (auto-persists on blur/Enter)"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          onClick={() => setReviewerModalIndex(idx)}
                          aria-label={`Open labeling assistant for invoice ${displayTitle}`}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition"
                          title="Open Reviewer Modal"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            onDeleteInvoice(inv.id);
                            setPoolItems(prev => prev.filter(p => p.id !== inv.id));
                          }}
                          aria-label={`Remove invoice ${inv.companyName || inv.id} from pool`}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition shrink-0"
                          title="Remove image from sandbox"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Trainee View: Status Banner and Collapsible Verified Catalog */
        <div className="space-y-3">
          {/* Trainee Verified Status Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-3 rounded-xl border border-indigo-500/30 shadow-sm flex items-center justify-between flex-wrap gap-2.5">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                  Official Training Queue Prepared ({sortedPoolItems.length} Invoices Available)
                </h3>
                <p className="text-[11px] text-slate-300 font-sans">
                  Administrator verified catalog. Launch an SLA tier below to test your transcription speed.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPoolCatalog(!showPoolCatalog)}
              className="text-xs font-bold text-indigo-200 hover:text-white bg-indigo-900/60 hover:bg-indigo-800 border border-indigo-400/30 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
              aria-expanded={showPoolCatalog}
            >
              <FileImage className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showPoolCatalog ? '✕ Hide Catalog' : `👁️ View Pool Images (${sortedPoolItems.length})`}</span>
            </button>
          </div>

          {/* Read-Only Invoice Catalog Pool for Trainee */}
          {showPoolCatalog && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600 flex items-center gap-1.5">
                  <FileImage className="w-3.5 h-3.5 text-indigo-600" /> Verified Pool Images ({sortedPoolItems.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className="text-[9px] bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition shadow-2xs"
                    title="Export verified labels as CSV template"
                  >
                    <Download className="w-3 h-3 text-indigo-600" />
                    <span>Download CSV Template</span>
                  </button>
                  <span className="text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                    Read-Only Training Queue
                  </span>
                </div>
              </div>

              {sortedPoolItems.length === 0 ? (
                <div className="border border-slate-200 rounded-xl p-4 text-center bg-white">
                  <p className="text-slate-400 text-xs font-semibold">No images prepared in this category yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                    Please contact the administrator to upload verified receipt invoices for this training category.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                  {sortedPoolItems.map((inv, idx) => {
                    const isMatchedFromCsv = !!(matchedCsvMap[inv.id] || inv.matchedFromCsv);
                    const displayTitle = matchedCsvMap[inv.id] || inv.matchedIdentifier || inv.title || getItemTitle(inv);
                    return (
                      <div key={inv.id} className="flex bg-white border border-slate-200 rounded-lg p-1.5 items-center justify-between group hover:border-indigo-300 transition shadow-2xs">
                        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-1">
                          {/* Thumbnail with Zoom preview */}
                          <div 
                            onClick={() => setReviewerModalIndex(idx)}
                            className="w-10 h-8 border border-slate-200 rounded bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative group-hover:border-indigo-300 shadow-sm"
                            title="Click to preview receipt image"
                          >
                            {inv.customImageUrl ? (
                              <img
                                src={inv.customImageUrl}
                                alt="Invoice thumbnail"
                                loading="lazy"
                                decoding="async"
                                className="object-cover w-full h-full group-hover:scale-105 transition duration-150"
                              />
                            ) : (
                              <FileImage className="w-4 h-4 text-slate-400" />
                            )}
                            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center justify-center">
                              <Plus className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          
                          {/* Read-Only Detail Display */}
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <p className="text-[10px] font-bold text-slate-800 truncate" title={displayTitle}>
                                {inv.issuer || inv.companyName || displayTitle || 'Standard Receipt'}
                              </p>
                              {isMatchedFromCsv && (
                                <span className="text-[8px] text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-1 rounded shrink-0">
                                  CSV
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-mono">
                              <span className="text-slate-400 font-bold">Target:</span>
                              <span className="font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/70 px-1 py-0.2 rounded border border-indigo-100 truncate">
                                {category === 'tax_number' ? (inv.target || inv.expectedNumber || '').replace(/^T/i, '') : (inv.target || inv.expectedNumber || '')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Preview inspection button */}
                        <button
                          onClick={() => setReviewerModalIndex(idx)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition shrink-0"
                          title="Preview Full Image"
                          aria-label="Preview full invoice image"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Interactive Mode Selector Grid (Launchpad) */}
      <div className="border-t border-slate-150 pt-5 space-y-4">
        {sortedPoolItems.length === 0 ? (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2.5 text-amber-800 text-xs font-medium font-sans">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">⚠️</span>
              <span>
                Upload at least 1 image or click <strong className="text-indigo-700 underline cursor-pointer hover:text-indigo-900" onClick={() => onAddSample(category)}>&quot;Populate Sample Image&quot;</strong> to enable assessments.
              </span>
            </div>
            <button
              onClick={() => onAddSample(category)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer shadow-sm transition"
            >
              + Quick Sample
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <Zap className="w-3.5 h-3.5 text-indigo-600" /> Assessment Launchpad:
            </span>
            <span className="text-[10px] text-indigo-600 font-bold font-sans">
              {sortedPoolItems.length} active image{sortedPoolItems.length !== 1 ? 's' : ''} in catalog
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id={`launch-grid-${category}`}>
          {/* Card 1 (Hard 180): Extreme Endurance */}
          <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 group relative ${
            sortedPoolItems.length > 0
              ? 'bg-slate-50/90 hover:bg-slate-50 border-purple-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-500/5'
              : 'bg-slate-50/40 border-slate-200 opacity-75'
          }`}>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase border ${
                  sortedPoolItems.length > 0 ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}>
                  Master Tier SLA
                </span>
                <span className="text-[11px] font-mono font-extrabold text-purple-600">180 Invoices</span>
              </div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <Zap className={`w-4 h-4 shrink-0 ${sortedPoolItems.length > 0 ? 'text-purple-600 fill-purple-600' : 'text-slate-400'}`} />
                <span>⚡ Extreme Endurance (180 Invoices)</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Full endurance drill (Smart 180-loop queue from {sortedPoolItems.length} loaded catalog images)
              </p>
              {sortedPoolItems.length > 0 && (
                <div className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 font-medium inline-flex items-center gap-1">
                  <span>♻️ Smart Pool Auto-Shuffling Active (180 Queue)</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-purple-100/80">
              <button
                onClick={() => onStartTest(category, 'hard_180')}
                disabled={sortedPoolItems.length === 0}
                className={`w-full py-2.5 px-3 font-bold rounded-xl transition flex items-center justify-center space-x-1.5 text-xs uppercase tracking-wider font-sans ${
                  sortedPoolItems.length > 0
                    ? 'bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white cursor-pointer shadow-sm hover:shadow-purple-500/20'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200 opacity-70 shadow-none'
                }`}
                aria-label="Launch 180-Invoice Test"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Launch 180-Invoice Test</span>
              </button>
            </div>
          </div>

          {/* Card 2 (Normal 90): Official Assessment */}
          <div className={`border-2 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 group relative ${
            sortedPoolItems.length > 0
              ? 'bg-gradient-to-b from-blue-50/70 via-white to-blue-50/40 border-blue-500/60 ring-4 ring-blue-500/10 shadow-sm hover:shadow-lg hover:shadow-blue-500/10'
              : 'bg-slate-50/40 border-slate-200 opacity-75 ring-0'
          }`}>
            {sortedPoolItems.length > 0 && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-sm">
                ★ Standard Qualification
              </div>
            )}
            <div className="space-y-2.5 mt-1">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase border ${
                  sortedPoolItems.length > 0 ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}>
                  ★ Official SLA Standard
                </span>
                <span className="text-[11px] font-mono font-extrabold text-blue-600">90 Invoices</span>
              </div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <Trophy className={`w-4 h-4 shrink-0 ${sortedPoolItems.length > 0 ? 'text-blue-600 fill-blue-600' : 'text-slate-400'}`} />
                <span>★ Official Assessment (90 Invoices)</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Standard qualification benchmark (90 Invoices Queue)
              </p>
              {sortedPoolItems.length > 0 && sortedPoolItems.length < 90 && (
                <div className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 font-medium inline-flex items-center gap-1">
                  <span>♻️ Smart Pool Auto-Shuffling Active (90 Queue)</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-blue-100">
              <button
                onClick={() => onStartTest(category, 'normal_90')}
                disabled={sortedPoolItems.length === 0}
                className={`w-full py-2.5 px-3 font-bold rounded-xl transition flex items-center justify-center space-x-1.5 text-xs uppercase tracking-wider font-sans ${
                  sortedPoolItems.length > 0
                    ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white cursor-pointer shadow-sm hover:shadow-blue-500/20'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200 opacity-70 shadow-none'
                }`}
                aria-label="Launch 90-Invoice Assessment"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch 90-Invoice Assessment</span>
              </button>
            </div>
          </div>

          {/* Card 3 (Easy 20): Practice Benchmark */}
          <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 group relative ${
            sortedPoolItems.length > 0
              ? 'bg-slate-50/90 hover:bg-slate-50 border-emerald-200 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-500/5'
              : 'bg-slate-50/40 border-slate-200 opacity-75'
          }`}>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase border ${
                  sortedPoolItems.length > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}>
                  Warm-up Drill
                </span>
                <span className="text-[11px] font-mono font-extrabold text-emerald-600">20 Invoices</span>
              </div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <Play className={`w-4 h-4 shrink-0 ${sortedPoolItems.length > 0 ? 'text-emerald-600 fill-emerald-600' : 'text-slate-400'}`} />
                <span>🎯 Practice Benchmark (20 Invoices)</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                Rapid practice speed test (20 Invoices Quick Run)
              </p>
              {sortedPoolItems.length > 0 && sortedPoolItems.length < 20 && (
                <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-medium inline-flex items-center gap-1">
                  <span>♻️ Smart Pool Auto-Shuffling Active (20 Queue)</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-emerald-100/80">
              <button
                onClick={() => onStartTest(category, 'easy_20')}
                disabled={sortedPoolItems.length === 0}
                className={`w-full py-2.5 px-3 font-bold rounded-xl transition flex items-center justify-center space-x-1.5 text-xs uppercase tracking-wider font-sans ${
                  sortedPoolItems.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white cursor-pointer shadow-sm hover:shadow-emerald-500/20'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200 opacity-70 shadow-none'
                }`}
                aria-label="Launch 20-Invoice Benchmark"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch 20-Invoice Benchmark</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Reviewer Modal */}
      {reviewerModalIndex !== null && sortedPoolItems[reviewerModalIndex] && (() => {
        const currentInv = sortedPoolItems[reviewerModalIndex];
        const isMatchedFromCsv = !!(matchedCsvMap[currentInv.id] || currentInv.matchedFromCsv);
        const displayIdentifier = matchedCsvMap[currentInv.id] || currentInv.matchedIdentifier || currentInv.title || getItemTitle(currentInv);
        const isItemSynced = currentInv.isSynced || lastSavedId === currentInv.id;

        const handleNextReview = async () => {
          // Auto-save if inputs differ from active record
          const cleanTarget = cleanEnteredTarget(modalTarget, category);
          if (cleanTarget !== currentInv.target || modalIssuer.trim() !== currentInv.issuer) {
            await handleSaveVerifyCode(modalTarget, modalIssuer, currentInv);
          }
          if (reviewerModalIndex < sortedPoolItems.length - 1) {
            setReviewerModalIndex(reviewerModalIndex + 1);
          } else {
            setReviewerModalIndex(null);
          }
        };

        const handlePrevReview = async () => {
          const cleanTarget = cleanEnteredTarget(modalTarget, category);
          if (cleanTarget !== currentInv.target || modalIssuer.trim() !== currentInv.issuer) {
            await handleSaveVerifyCode(modalTarget, modalIssuer, currentInv);
          }
          if (reviewerModalIndex > 0) {
            setReviewerModalIndex(reviewerModalIndex - 1);
          }
        };

        return (
          <div 
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            id="category-reviewer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviewer-modal-title"
          >
            <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col md:flex-row max-h-[92vh]">
              
              {/* Left Side: Receipt Image Preview */}
              <div className="bg-slate-950 p-5 sm:p-6 flex flex-col justify-between items-center md:w-[48%] border-r border-slate-800 min-h-[280px] sm:min-h-[340px] relative">
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-800 text-slate-300 font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded tracking-wide">
                  <span>Image {reviewerModalIndex + 1} of {sortedPoolItems.length}</span>
                </div>
                
                <button 
                  onClick={() => setReviewerModalIndex(null)}
                  aria-label="Close Reviewer Modal"
                  className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex-1 w-full flex items-center justify-center p-2 mb-3 mt-7 overflow-hidden max-h-[380px]">
                  {currentInv.customImageUrl ? (
                    <img 
                      src={currentInv.customImageUrl} 
                      alt={`Receipt ${displayIdentifier}`} 
                      className="max-h-full max-w-full rounded shadow-md object-contain border border-slate-800"
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-500">
                      <FileImage className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">No image preview available</p>
                    </div>
                  )}
                </div>

                <div className="w-full flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
                  <span className="truncate max-w-[180px]">{currentInv.title || getItemTitle(currentInv)}</span>
                  <span className="text-indigo-400 font-bold uppercase tracking-wider">{category}</span>
                </div>
              </div>

              {/* Right Side: Data Reviewer & Labeling Fields */}
              <div className="p-5 sm:p-6 md:w-[52%] flex flex-col justify-between bg-white overflow-y-auto space-y-4">
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block mb-1">
                      🏷️ Batch Reviewer & Labeling Assistant
                    </span>
                    <h3 id="reviewer-modal-title" className="text-lg font-bold text-slate-900 font-sans tracking-tight leading-none">
                      Verify & Set Target Values
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {category === 'date_number' 
                        ? 'Verify the 8-digit transaction date (YYYYMMDD) for this receipt image.'
                        : category === 'phone_number'
                        ? 'Verify the telephone contact digits for this receipt image.'
                        : "Enter 13 numeric digits (without 'T')"}
                    </p>
                  </div>

                  {/* 3. Natural Sort & Identifier Display:
                      Clearly display: "Image File: [item.title] | Matched Key: [normalizeKey(item.title)]"
                      and show a small green badge "☁️ Synced to DB" when saved. */}
                  <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-xl p-3 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="overflow-hidden min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 block">
                        Matched Image Identifier
                      </span>
                      <p className="text-xs font-bold font-mono text-indigo-950 truncate mt-0.5">
                        Image File: {currentInv.title || getItemTitle(currentInv)} | Matched Key: {normalizeKey(currentInv.title || getItemTitle(currentInv))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isItemSynced && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-fade-in shadow-2xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ☁️ Synced to DB
                        </span>
                      )}
                      {isMatchedFromCsv && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 font-bold px-2 py-0.5 rounded-full shrink-0">
                          CSV
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Input Fields */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                          Expected Transcribed Value <span className="text-rose-500">*</span>
                        </label>
                        {isItemSynced && (
                          <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Persisted
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder={config[category]?.codePlaceholder || '1234567890123'}
                        value={modalTarget}
                        autoFocus
                        onChange={(e) => {
                          const val = category === 'tax_number' ? e.target.value.replace(/^T/i, '') : e.target.value;
                          setModalTarget(val);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            await handleSaveVerifyCode(modalTarget, modalIssuer, currentInv);
                            handleNextReview();
                          }
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 text-sm text-slate-900 font-mono font-bold rounded-xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 tracking-wide text-indigo-700 uppercase"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        {category === 'tax_number' ? "Enter 13 numeric digits (without 'T'). " : ''}Press <strong className="text-slate-700 font-bold">Enter</strong> to save and proceed to next image.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">
                        Invoice Issuer / Store Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Aeon Retail Co., Ltd."
                        value={modalIssuer}
                        onChange={(e) => setModalIssuer(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            await handleSaveVerifyCode(modalTarget, modalIssuer, currentInv);
                            handleNextReview();
                          }
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 text-xs text-slate-900 rounded-xl outline-none focus:bg-white focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Navigation Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 gap-2">
                  <button
                    type="button"
                    onClick={handlePrevReview}
                    disabled={reviewerModalIndex === 0}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSavingCode}
                      onClick={() => handleSaveVerifyCode(modalTarget, modalIssuer, currentInv)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Save verified transcription target code to Database & Cache"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingCode ? 'Saving...' : 'Save'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReviewerModalIndex(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={handleNextReview}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      {reviewerModalIndex < sortedPoolItems.length - 1 ? (
                        <>Next <ChevronRight className="w-3.5 h-3.5" /></>
                      ) : (
                        'Finish Review'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CategorySandbox;
