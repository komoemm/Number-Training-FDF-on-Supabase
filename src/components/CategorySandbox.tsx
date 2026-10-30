/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
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
  Check,
  Archive,
  FileArchive,
  Lock,
  Unlock,
  Hash
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
  target_value?: string;
  target_digits?: number;
  custom_digit_length?: number;
}

export interface OperationProgress {
  mode: 'export' | 'restore';
  current: number;
  total: number;
  percent: number;
  statusText: string;
  currentFilename?: string;
}

interface CategorySandboxProps {
  category: TrainingCategory;
  invoices: (GeneratedInvoiceData & { customImageUrl?: string; title?: string })[];
  onUploadImages: (files: FileList | File[], category: TrainingCategory) => Promise<void>;
  onAddSample?: (category: TrainingCategory) => void;
  onDeleteInvoice: (id: string) => void;
  onUpdateCode: (id: string, newCode: string, targetDigits?: number) => void;
  onUpdateCompany: (id: string, newCompany: string) => void;
  onClearPool: (category: TrainingCategory) => void;
  onOpenLabelingModal: (indexInAll: number) => void;
  allInvoices: (GeneratedInvoiceData & { customImageUrl?: string })[];
  onStartTest?: (category: TrainingCategory, mode: TrainingMode) => void;
  onStart100CardTest?: () => void;
  uploadProgressError: string | null;
  customExpectedCode: string;
  setCustomExpectedCode: (val: string) => void;
  customCompanyName: string;
  setCustomCompanyName: (val: string) => void;
  isAdmin?: boolean;
  userRole?: string;
  onRefreshPool?: () => Promise<void>;
  isRefreshingPool?: boolean;
  onCategoryChange?: (category: TrainingCategory) => void;
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
// - tax_number: converts full-width numbers, preserves 10-digit registration numbers or strips leading "T"/"t" for 13 digits
// - phone_number: converts full-width numbers, strictly preserves leading zeros as text
// - date_number: converts full-width numbers, normalizes strictly to 8 digits YYYYMMDD
export const cleanEnteredTarget = (raw: string, cat: TrainingCategory, targetDigits?: number): string => {
  const val = String(raw || '').trim();
  const catLower = String(cat || '').toLowerCase();
  if (catLower === 'tax_number' || catLower === 'tax') {
    let tax = val.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const rawDigits = tax.replace(/\D/g, '');
    if (targetDigits && targetDigits > 0) {
      return rawDigits.slice(0, targetDigits);
    }
    if (rawDigits.length === 10) {
      return rawDigits;
    }
    tax = tax.replace(/^T/i, '');
    tax = tax.replace(/\D/g, '');
    if (tax.length > 13) {
      return tax.slice(-13);
    }
    return tax;
  }
  if (catLower === 'date_number' || catLower === 'date') {
    let dateStr = val.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    const dateParts = dateStr.split(/[/.\-年日月\s]+/).filter(Boolean);
    if (dateParts.length >= 3 && dateParts[0].length === 4) {
      const y = dateParts[0];
      const m = dateParts[1].padStart(2, '0').slice(-2);
      const d = dateParts[2].padStart(2, '0').slice(-2);
      return `${y}${m}${d}`;
    }
    const digitsOnly = dateStr.replace(/\D/g, '');
    if (digitsOnly.length >= 8) {
      return digitsOnly.slice(0, 8);
    }
    if (digitsOnly.length === 6) {
      return `20${digitsOnly}`;
    }
    if (digitsOnly.length > 0 && digitsOnly.length < 8) {
      return digitsOnly.padEnd(8, '0');
    }
    return digitsOnly || '20260406';
  }
  if (catLower === 'phone_number' || catLower === 'phone') {
    let phone = val.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    // Strictly preserve leading zeros as text; normalize hyphens and strip whitespace
    return phone.replace(/[ー－―]/g, '-').replace(/\s+/g, '');
  }
  return val;
};

// Friendly Category Label for Toasts
export const getCategoryLabel = (cat: TrainingCategory): string => {
  switch (cat) {
    case 'tax_number':
      return 'Tax Number';
    case 'date_number':
      return 'Date Number';
    case 'phone_number':
      return 'Phone Number';
    default:
      return 'Category';
  }
};

export const CategorySandbox: React.FC<CategorySandboxProps> = ({
  category,
  invoices,
  allInvoices = [],
  onUploadImages,
  onAddSample,
  onDeleteInvoice,
  onUpdateCode,
  onUpdateCompany,
  onClearPool,
  onStartTest,
  onStart100CardTest,
  uploadProgressError,
  customExpectedCode,
  setCustomExpectedCode,
  customCompanyName,
  setCustomCompanyName,
  isAdmin = false,
  userRole,
  onRefreshPool,
  isRefreshingPool = false,
  onCategoryChange
}) => {
  // Role-Based Access Control: Admin tools are strictly restricted to admin role
  const isEffectiveAdmin = userRole ? userRole === 'admin' : (isAdmin === true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const zipFileInputRef = useRef<HTMLInputElement>(null);
  const reviewerModalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [showPoolCatalog, setShowPoolCatalog] = useState<boolean>(false);
  const [reviewerModalIndex, setReviewerModalIndex] = useState<number | null>(null);
  const [matchedCsvMap, setMatchedCsvMap] = useState<Record<string, string>>({});

  // Active state 'poolItems' with complete hydration and persistence metadata
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // ZIP export & restore status & progress modal
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [isRestoringZip, setIsRestoringZip] = useState<boolean>(false);
  const [operationProgress, setOperationProgress] = useState<OperationProgress | null>(null);

  // Modal temporary edit state
  const [modalTarget, setModalTarget] = useState<string>('');
  const [modalIssuer, setModalIssuer] = useState<string>('');
  const [modalTargetDigits, setModalTargetDigits] = useState<number | ''>('');
  const [isDigitsLocked, setIsDigitsLocked] = useState<boolean>(false);
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

  // Natural Sort:
  // Maintain natural alphanumeric sort for all pool items so that item '2' comes before '10'
  const sortedPoolItems = useMemo(() => {
    return [...poolItems].sort((a, b) => {
      const titleA = a.title || getItemTitle(a);
      const titleB = b.title || getItemTitle(b);
      return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [poolItems]);

  /**
   * Auto-Hydrate Targets on Image Pool Load:
   * - In 'loadPoolImages':
   *   * Fetch saved targets from Supabase table 'training_labels' for the current category.
   *   * Create lookup map: key = normalizeKey(row.image_identifier), value = row.expected_value.
   *   * Map each pool item: set item.target = value and item.issuer = row.issuer_or_note.
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
      const cached = localCache[normKey] as any;
      const targetDigits = cached?.target_digits || cached?.custom_digit_length || inv.target_digits || inv.custom_digit_length;
      const targetVal = cached?.expected_value
        ? cleanEnteredTarget(cached.expected_value, category, targetDigits)
        : cleanEnteredTarget(inv.expectedNumber || '', category, targetDigits);
      const issuerVal = (cached?.issuer_or_note !== undefined ? cached.issuer_or_note : inv.companyName) || '';

      return {
        ...inv,
        title,
        target: targetVal,
        expectedNumber: targetVal,
        target_value: targetVal,
        target_digits: targetDigits,
        custom_digit_length: targetDigits,
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
        const lookupMap = new Map<string, { expected_value: string; target_value?: string; target_digits?: number; custom_digit_length?: number; issuer_or_note?: string }>();
        const newCache: Record<string, any> = { ...localCache };

        dbLabels.forEach((row: any) => {
          if (row.image_identifier) {
            const key = normalizeKey(row.image_identifier);
            const digits = row.target_digits ? Number(row.target_digits) : (row.custom_digit_length ? Number(row.custom_digit_length) : undefined);
            const cleanVal = cleanEnteredTarget(row.expected_value || '', category, digits);
            lookupMap.set(key, {
              expected_value: cleanVal,
              target_value: row.target_value || cleanVal,
              target_digits: digits,
              custom_digit_length: digits,
              issuer_or_note: row.issuer_or_note || ''
            });
            newCache[key] = {
              expected_value: cleanVal,
              target_value: row.target_value || cleanVal,
              target_digits: digits,
              custom_digit_length: digits,
              issuer_or_note: row.issuer_or_note || ''
            };
          }
        });

        // Update LocalStorage cache with remote labels
        try {
          localStorage.setItem(cacheKey, JSON.stringify(newCache));
        } catch (e) {
          console.warn('[Auto-Hydrate] Failed to update localStorage mirror cache:', e);
        }

        // Map each pool item: set item.target = value and item.issuer = row.issuer_or_note
        setPoolItems((prevItems) => {
          return prevItems.map((item) => {
            const itemKey = normalizeKey(item.title || getItemTitle(item));
            if (lookupMap.has(itemKey)) {
              const record = lookupMap.get(itemKey)!;
              const cleanVal = record.expected_value;
              const issuerVal = record.issuer_or_note || item.issuer;
              const digits = record.target_digits ?? record.custom_digit_length;

              if (cleanVal !== item.expectedNumber || digits !== item.target_digits) {
                onUpdateCode(item.id, cleanVal, digits);
              }
              if (record.issuer_or_note && record.issuer_or_note !== item.companyName && onUpdateCompany) {
                onUpdateCompany(item.id, record.issuer_or_note);
              }

              return {
                ...item,
                target: cleanVal,
                expectedNumber: cleanVal,
                target_value: cleanVal,
                target_digits: digits,
                custom_digit_length: digits,
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
   * Persistent Storage Integration on Save (handleSaveVerifyCode):
   * - Clean the entered target according to dynamic digit length.
   * - Update active state 'poolItems' with target_digits and custom_digit_length.
   * - Immediately persist to Supabase 'training_labels' with onConflict.
   * - Update LocalStorage mirror (`training_labels_cache_${category}`).
   */
  const handleSaveVerifyCode = async (
    targetInput: string,
    issuerInput: string,
    targetDigitsInput?: number | '',
    itemToSave?: PoolItem
  ) => {
    const reviewingItem = itemToSave || (reviewerModalIndex !== null ? sortedPoolItems[reviewerModalIndex] : null);
    if (!reviewingItem) return;

    setIsSavingCode(true);

    const digitsVal = typeof targetDigitsInput === 'number' && targetDigitsInput > 0
      ? targetDigitsInput
      : (modalTargetDigits !== '' ? Number(modalTargetDigits) : (targetInput.replace(/\D/g, '').length || 13));

    const cleanTarget = cleanEnteredTarget(targetInput, category, digitsVal);
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
            target_value: cleanTarget,
            target_digits: digitsVal,
            custom_digit_length: digitsVal,
            issuer: issuerNote,
            companyName: issuerNote || item.companyName,
            isSynced: true
          };
        }
        return item;
      })
    );

    // Propagate to parent state
    onUpdateCode(reviewingItem.id, cleanTarget, digitsVal);
    if (onUpdateCompany) {
      onUpdateCompany(reviewingItem.id, issuerNote);
    }

    // Update LocalStorage mirror
    const cacheKey = `training_labels_cache_${category}`;
    try {
      const rawCache = localStorage.getItem(cacheKey);
      const cacheMap: Record<string, any> = rawCache ? JSON.parse(rawCache) : {};
      cacheMap[normalizedKey] = {
        expected_value: cleanTarget,
        target_value: cleanTarget,
        target_digits: digitsVal,
        custom_digit_length: digitsVal,
        issuer_or_note: issuerNote
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheMap));
    } catch (e) {
      console.warn('Failed to update local cache mirror:', e);
    }

    // 1. Storage Upload Pipeline:
    // Ensure receipt images upload to the 'invoices' bucket:
    let publicUrl = reviewingItem.customImageUrl || '';
    const cleanFileName = (reviewingItem.title || 'receipt.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `invoices/${Date.now()}_${cleanFileName}`;

    try {
      const blob = await fetchImageBlob(reviewingItem);
      if (blob) {
        const { data, error } = await supabase.storage
          .from('invoices')
          .upload(filePath, blob, { upsert: true });

        // Verify public URL extraction:
        if (!error && data) {
          const { data: { publicUrl: extractedUrl } } = supabase.storage
            .from('invoices')
            .getPublicUrl(filePath);
          if (extractedUrl) {
            publicUrl = extractedUrl;
          }
        }
      }
    } catch (storageErr) {
      console.warn('Notice during Supabase Storage upload:', storageErr);
    }

    // 2. Database Persistence:
    // Insert the verified card directly into 'custom_invoices' table:
    const verifiedTargetValue = cleanTarget;
    const targetDigitLength = verifiedTargetValue.replace(/\D/g, '').length || (typeof digitsVal === 'number' ? digitsVal : 13);
    const storeName = issuerNote || reviewingItem.companyName || 'Store Receipt';

    try {
      await supabase.from('custom_invoices').upsert({
        id: reviewingItem.id,
        image_url: publicUrl,
        custom_image_url: publicUrl,
        target_value: verifiedTargetValue,
        expected_number: verifiedTargetValue,
        target_digit_length: targetDigitLength,
        target_digits: targetDigitLength,
        custom_digit_length: targetDigitLength,
        issuer_name: storeName,
        company_name: storeName,
        category: category,
        invoice_date: reviewingItem.invoiceDate || new Date().toLocaleDateString('ja-JP'),
        total_amount: reviewingItem.totalAmount || '2,500円',
        difficulty: reviewingItem.difficulty || 'medium',
        style: reviewingItem.style || 'modern'
      });

      // Synchronize with training_labels
      await supabase.from('training_labels').upsert({
        category: category,
        image_identifier: normalizeKey(reviewingItem.title),
        expected_value: verifiedTargetValue,
        target_value: verifiedTargetValue,
        target_digits: targetDigitLength,
        custom_digit_length: targetDigitLength,
        issuer_or_note: storeName
      }, { onConflict: 'category,image_identifier' });

      // 3. UI Status Notification:
      // Display a success toast/badge confirming 'Successfully uploaded to Supabase Storage (invoices) and saved to custom_invoices table'
      setLastSavedId(reviewingItem.id);
      setToastFeedback({
        type: 'success',
        message: 'Successfully uploaded to Supabase Storage (invoices) and saved to custom_invoices table'
      });
    } catch (err) {
      console.warn('Network offline or error during Supabase sync:', err);
      setToastFeedback({
        type: 'warning',
        message: 'Saved locally, but cloud synchronization encountered an issue.'
      });
    } finally {
      setIsSavingCode(false);
    }
  };

  // Sync reviewer modal inputs with current active item
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

      const existingDigits = activeReviewItem.target_digits || activeReviewItem.custom_digit_length;
      if (existingDigits && existingDigits > 0) {
        setModalTargetDigits(existingDigits);
        setIsDigitsLocked(true);
      } else {
        const rawDigitsCount = initialTarget.replace(/\D/g, '').length;
        setModalTargetDigits(rawDigitsCount > 0 ? rawDigitsCount : '');
        setIsDigitsLocked(false);
      }
    }
  }, [activeReviewItemId, category]);

  // WCAG 2.1 AA Focus Trap & ESC key to dismiss Reviewer Modal
  useEffect(() => {
    if (reviewerModalIndex === null) {
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
        previouslyFocusedElementRef.current = null;
      }
      return;
    }

    // Save previous active element for restoration on close
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setReviewerModalIndex(null);
        return;
      }

      if (e.key === 'Tab' && reviewerModalRef.current) {
        const focusableElements = reviewerModalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusable: HTMLElement[] = Array.from(focusableElements).filter(
          (el): el is HTMLElement => (el as HTMLElement).offsetParent !== null
        );
        if (focusable.length === 0) return;

        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [reviewerModalIndex]);

  /**
   * Helper to fetch Blob for ZIP creation
   */
  const fetchImageBlob = async (item: PoolItem): Promise<Blob | null> => {
    const url = item.customImageUrl || (item as any).url || (item as any).imageUrl;
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (err) {
      console.warn(`Could not fetch image blob for ${item.title}:`, err);
      return null;
    }
  };

  /**
   * 3. Category-Aware ZIP Export Logic (handleExportCategoryZip):
   * - Check if poolItems has images. If empty, show toast: "Backup ပြုလုပ်ရန် ပုံများ မရှိသေးပါ။"
   * - Display Burmese progress toast: "[Category] အတွက် ZIP Backup ဖိုင် ထုတ်ယူနေပါသည်... ခေတ္တစောင့်ပါ။"
   * - Build 'manifest.json' object:
   *   * version: "1.0"
   *   * category: activeCategory
   *   * exportedAt: new Date().toISOString()
   *   * totalImages: poolItems.length
   *   * items: poolItems.map(item => ({ filename, image_identifier, expected_value, issuer }))
   * - Add manifest.json and image files to root of ZIP.
   * - Generate ZIP blob: await zip.generateAsync({ type: 'blob' }).
   * - Trigger browser download: `backup_${activeCategory}_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`.
   * - Show success toast: "[Category] ၏ ပုံများနှင့် သတ်မှတ်တန်ဖိုးများ အားလုံးကို ZIP ဖိုင်အဖြစ် ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။"
   */
  /**
   * 3. Full-Fidelity Category-Aware ZIP Export Logic (handleExportCategoryZip):
   * - Bundles images with JSZip.
   * - Generates and bundles 'manifest.json' inside the zip root containing full card metadata:
   *   [{ 'filename': img.name, 'target_value': img.target_value, 'target_digit_length': img.target_digit_length, 'issuer_name': img.issuer_name }]
   * - Uses asynchronous chunking to prevent UI freezing (Core Web Vitals INP).
   * - Shows interactive Progress Indicator Modal.
   */
  const handleExportCategoryZip = async () => {
    if (!isEffectiveAdmin) {
      setToastFeedback({
        type: 'error',
        message: 'Permission denied: Only Admin users can export backup files.'
      });
      return;
    }

    if (sortedPoolItems.length === 0) {
      setToastFeedback({
        type: 'warning',
        message: 'Backup ပြုလုပ်ရန် ပုံများ မရှိသေးပါ။'
      });
      return;
    }

    const catLabel = getCategoryLabel(category);
    setIsExportingZip(true);
    setOperationProgress({
      mode: 'export',
      current: 0,
      total: sortedPoolItems.length,
      percent: 5,
      statusText: `${catLabel} အတွက် ZIP Backup ဖိုင် စတင်ပြင်ဆင်နေပါသည်...`,
      currentFilename: 'manifest.json'
    });

    try {
      const zip = new JSZip();

      // Step 2: Full-Fidelity ZIP Export Manifest
      // Format: [{ 'filename': img.name, 'target_value': img.target_value, 'target_digit_length': img.target_digit_length, 'issuer_name': img.issuer_name }]
      const manifest = sortedPoolItems.map((item) => {
        const rawTitle = item.title || getItemTitle(item);
        const filename = /\.[a-z0-9]+$/i.test(rawTitle) ? rawTitle : `${rawTitle}.jpg`;
        const cleanTarget = item.target_value || item.target || item.expectedNumber || '';
        const targetDigitLength = item.target_digits ?? item.custom_digit_length ?? (cleanTarget ? cleanTarget.replace(/\D/g, '').length : 13);
        const issuerName = item.issuer || item.companyName || '';
        return {
          filename,
          target_value: cleanTarget,
          target_digit_length: targetDigitLength,
          issuer_name: issuerName
        };
      });

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Add each image file to the root of the ZIP with asynchronous chunking
      for (let i = 0; i < sortedPoolItems.length; i++) {
        const item = sortedPoolItems[i];
        const manifestItem = manifest[i];

        setOperationProgress({
          mode: 'export',
          current: i + 1,
          total: sortedPoolItems.length,
          percent: Math.min(94, Math.round(((i + 1) / (sortedPoolItems.length + 1)) * 100)),
          statusText: `Processing image ${i + 1} of ${sortedPoolItems.length}...`,
          currentFilename: manifestItem.filename
        });

        try {
          const blob = await fetchImageBlob(item);
          if (blob) {
            zip.file(manifestItem.filename, blob);
          }
        } catch (fetchErr) {
          console.warn(`Error fetching image blob for ${manifestItem.filename}:`, fetchErr);
        }

        // Asynchronous chunking: yield to event loop every 3 images to maintain UI responsiveness (INP)
        if (i % 3 === 0 || i === sortedPoolItems.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      }

      setOperationProgress({
        mode: 'export',
        current: sortedPoolItems.length,
        total: sortedPoolItems.length,
        percent: 96,
        statusText: 'Compressing archive and generating ZIP blob...',
        currentFilename: 'archive.zip'
      });

      // Generate ZIP blob
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // Trigger browser download
      const filenameDate = new Date().toISOString().replace(/[:.]/g, '-');
      const downloadFilename = `backup_${category}_${filenameDate}.zip`;
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      setToastFeedback({
        type: 'success',
        message: `${catLabel} ၏ ပုံများနှင့် သတ်မှတ်တန်ဖိုးများ အားလုံးကို ZIP ဖိုင်အဖြစ် ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။`
      });
    } catch (err: any) {
      console.error('ZIP Export Error:', err);
      setToastFeedback({
        type: 'error',
        message: `ZIP ဖိုင် ထုတ်ယူရာတွင် ချို့ယွင်းချက် ဖြစ်ပေါ်ပါသည်: ${err?.message || 'Export error'}`
      });
    } finally {
      setIsExportingZip(false);
      setOperationProgress(null);
    }
  };

  /**
   * 4. Full-Fidelity Category-Aware ZIP Restore Logic (handleRestoreCategoryZip):
   * a. Extracts and parses 'manifest.json' first.
   * b. Uploads extracted images to Supabase Storage.
   * c. Inserts or updates corresponding records in Supabase database tables ('custom_invoices' & 'training_labels')
   *    with their exact target_value and target_digit_length from manifest.json so Admin does not need to re-verify them.
   * d. Provides fallback extraction if manifest.json is not present (auto-detecting digits from filenames).
   * - Uses asynchronous chunking to prevent UI freezing (Core Web Vitals INP).
   * - Displays Progress Indicator Modal during restore.
   */
  const handleRestoreCategoryZip = async (file: File) => {
    if (!isEffectiveAdmin) {
      setToastFeedback({
        type: 'error',
        message: 'Permission denied: Only Admin users can restore training images.'
      });
      return;
    }

    setIsRestoringZip(true);
    setOperationProgress({
      mode: 'restore',
      current: 0,
      total: 1,
      percent: 5,
      statusText: 'Reading backup ZIP archive and inspecting manifest.json...'
    });

    try {
      const zip = await JSZip.loadAsync(file);

      // Step a: Extract and parse 'manifest.json' first
      const manifestFile = zip.file('manifest.json') || zip.file(/(^|\/)manifest\.json$/i)[0];
      let manifestItems: Array<{
        filename: string;
        target_value?: string;
        expected_value?: string;
        target_digit_length?: number;
        target_digits?: number;
        custom_digit_length?: number;
        issuer_name?: string;
        issuer?: string;
        company_name?: string;
        companyName?: string;
      }> | null = null;

      if (manifestFile) {
        try {
          const manifestContent = await manifestFile.async('string');
          const parsed = JSON.parse(manifestContent);
          if (Array.isArray(parsed)) {
            manifestItems = parsed;
          } else if (parsed && Array.isArray(parsed.items)) {
            manifestItems = parsed.items;
          }
        } catch (e) {
          console.warn('Notice parsing manifest.json, falling back to auto-detection:', e);
        }
      }

      // Step d: Fallback extraction if manifest.json is not present (auto-detecting digits from filenames)
      if (!manifestItems || manifestItems.length === 0) {
        const imageEntries = zip.filter((path, entry) => {
          if (entry.dir) return false;
          if (path.includes('__MACOSX') || path.startsWith('.')) return false;
          return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(path);
        });

        if (imageEntries.length === 0) {
          throw new Error("ZIP ဖိုင်အတွင်း ပုံဖိုင်များ မတွေ့ရှိပါ။ (No image files found in ZIP archive)");
        }

        manifestItems = imageEntries.map((entry) => {
          const filename = entry.name.split('/').pop() || entry.name;
          let target = '';
          let digits = 13;

          if (category === 'tax_number') {
            const tMatch = filename.match(/T\d{13}/i);
            if (tMatch) {
              target = tMatch[0].replace(/^T/i, '');
              digits = 13;
            } else {
              const d13 = filename.match(/\d{13}/);
              if (d13) {
                target = d13[0];
                digits = 13;
              } else {
                const rawDigits = filename.replace(/\D/g, '');
                target = rawDigits.slice(-13);
                digits = target.length || 13;
              }
            }
          } else if (category === 'date_number') {
            const dateMatch = filename.match(/20\d{6}/) || filename.match(/\d{8}/);
            if (dateMatch) {
              target = dateMatch[0];
              digits = 8;
            } else {
              const rawDigits = filename.replace(/\D/g, '');
              target = rawDigits.slice(0, 8);
              digits = target.length || 8;
            }
          } else if (category === 'phone_number') {
            const phoneMatch = filename.match(/0\d{9,10}/) || filename.match(/\d{10,11}/);
            if (phoneMatch) {
              target = phoneMatch[0];
              digits = target.length;
            } else {
              const rawDigits = filename.replace(/\D/g, '');
              target = rawDigits.slice(0, 11);
              digits = target.length || 10;
            }
          } else {
            target = filename.replace(/\D/g, '');
            digits = target.length || 13;
          }

          const cleanIssuer = filename.replace(/\.[^/.]+$/, '').replace(/[_.\-\d]+/g, ' ').trim() || 'Store Receipt';

          return {
            filename: entry.name,
            target_value: target,
            target_digit_length: digits,
            issuer_name: cleanIssuer
          };
        });
      }

      const totalItems = manifestItems.length;
      const reconstructedItems: PoolItem[] = [];
      const filesToUpload: File[] = [];
      const dbCustomInvoiceRows: any[] = [];
      const dbTrainingLabelRows: any[] = [];
      const cacheUpdates: Record<string, any> = {};

      // Asynchronous chunking loop
      for (let i = 0; i < totalItems; i++) {
        const m = manifestItems[i];
        const rawFilename = m.filename || `image_${i + 1}.jpg`;
        const cleanFilename = rawFilename.split('/').pop() || rawFilename;

        setOperationProgress({
          mode: 'restore',
          current: i + 1,
          total: totalItems,
          percent: Math.min(94, Math.round(((i + 1) / totalItems) * 100)),
          statusText: `Processing image ${i + 1} of ${totalItems}...`,
          currentFilename: cleanFilename
        });

        // Locate file in ZIP
        let fileInZip = zip.file(rawFilename);
        if (!fileInZip) {
          fileInZip = zip.file(cleanFilename);
        }
        if (!fileInZip) {
          const found = zip.filter((path, f) => !f.dir && (
            path.toLowerCase() === rawFilename.toLowerCase() ||
            path.toLowerCase().endsWith('/' + cleanFilename.toLowerCase()) ||
            normalizeKey(path) === normalizeKey(cleanFilename)
          ));
          if (found.length > 0) fileInZip = found[0];
        }

        if (!fileInZip) {
          console.warn(`File ${rawFilename} not found in zip, skipping.`);
          continue;
        }

        const imgBlob = await fileInZip.async('blob');
        const restoredFile = new File([imgBlob], cleanFilename, { type: imgBlob.type || 'image/jpeg' });
        filesToUpload.push(restoredFile);

        // Step b: Upload extracted image to Supabase Storage
        let finalImageUrl = '';
        const storagePath = `pool/${Date.now()}_${i}_${cleanFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        try {
          const { data: storageData, error: storageErr } = await supabase.storage
            .from('invoices')
            .upload(storagePath, imgBlob, {
              contentType: imgBlob.type || 'image/jpeg',
              upsert: true
            });
          if (!storageErr && storageData) {
            const { data: urlData } = supabase.storage
              .from('invoices')
              .getPublicUrl(storageData.path || storagePath);
            if (urlData?.publicUrl) {
              finalImageUrl = urlData.publicUrl;
            }
          }
        } catch (storageErr) {
          console.warn('Storage upload notice, falling back to data URL:', storageErr);
        }

        // Safe fallback if Supabase storage is offline or mock client
        if (!finalImageUrl) {
          finalImageUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(URL.createObjectURL(imgBlob));
            reader.readAsDataURL(imgBlob);
          });
        }

        // Calculate exact target_value and target_digit_length
        const targetDigits = Number(m.target_digit_length ?? m.target_digits ?? m.custom_digit_length) ||
          (m.target_value ? m.target_value.replace(/\D/g, '').length : 13);
        const cleanVal = cleanEnteredTarget(m.target_value || m.expected_value || '', category, targetDigits);
        const issuerVal = (m.issuer_name || m.issuer || m.company_name || m.companyName || cleanFilename.replace(/\.[^/.]+$/, '')).trim();
        const normalizedKey = normalizeKey(cleanFilename);
        const itemId = `restored_${category}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;

        const poolItem: PoolItem = {
          id: itemId,
          title: cleanFilename,
          customImageUrl: finalImageUrl,
          target: cleanVal,
          expectedNumber: cleanVal,
          target_value: cleanVal,
          target_digits: targetDigits,
          custom_digit_length: targetDigits,
          issuer: issuerVal,
          companyName: issuerVal || cleanFilename,
          category: category,
          isSynced: true,
          matchedFromCsv: false
        };
        reconstructedItems.push(poolItem);

        // Step c: Prepare records for Supabase database tables with exact target_value and target_digit_length
        dbCustomInvoiceRows.push({
          id: itemId,
          category: category,
          expected_number: cleanVal,
          target_value: cleanVal,
          target_digit_length: targetDigits,
          target_digits: targetDigits,
          custom_digit_length: targetDigits,
          issuer_name: issuerVal,
          company_name: issuerVal,
          invoice_date: new Date().toLocaleDateString('ja-JP'),
          total_amount: `${(2000 + Math.floor(Math.random() * 8000)).toLocaleString()}円`,
          difficulty: 'medium',
          style: 'modern',
          image_url: finalImageUrl,
          custom_image_url: finalImageUrl
        });

        dbTrainingLabelRows.push({
          category: category,
          image_identifier: normalizedKey,
          expected_value: cleanVal,
          target_value: cleanVal,
          target_digits: targetDigits,
          custom_digit_length: targetDigits,
          issuer_or_note: issuerVal
        });

        cacheUpdates[normalizedKey] = {
          expected_value: cleanVal,
          target_value: cleanVal,
          target_digits: targetDigits,
          custom_digit_length: targetDigits,
          issuer_or_note: issuerVal
        };

        // Asynchronous chunking to prevent UI freezing (Core Web Vitals INP)
        if (i % 3 === 0 || i === totalItems - 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }

      setOperationProgress({
        mode: 'restore',
        current: totalItems,
        total: totalItems,
        percent: 98,
        statusText: 'Synchronizing records to database and local cache...',
        currentFilename: 'database.sync'
      });

      // Upsert into Supabase custom_invoices table
      if (dbCustomInvoiceRows.length > 0) {
        try {
          await supabase.from('custom_invoices').upsert(dbCustomInvoiceRows);
        } catch (err) {
          console.warn('Supabase custom_invoices upsert warning:', err);
        }
      }

      // Upsert into Supabase training_labels table
      if (dbTrainingLabelRows.length > 0) {
        try {
          await supabase.from('training_labels').upsert(dbTrainingLabelRows, {
            onConflict: 'category,image_identifier'
          });
        } catch (err) {
          console.warn('Supabase training_labels upsert warning:', err);
        }
      }

      // Update LocalStorage mirror cache for category
      const cacheKey = `training_labels_cache_${category}`;
      try {
        const rawCache = localStorage.getItem(cacheKey);
        const existingMap = rawCache ? JSON.parse(rawCache) : {};
        localStorage.setItem(cacheKey, JSON.stringify({ ...existingMap, ...cacheUpdates }));
      } catch (e) {
        console.warn('LocalStorage cache update on restore warning:', e);
      }

      // Update parent invoices pool if onUploadImages is supported
      if (filesToUpload.length > 0 && onUploadImages) {
        try {
          await onUploadImages(filesToUpload, category);
        } catch (err) {
          console.warn('Uploading restored files to parent pool warning:', err);
        }
      }

      // Propagate target values to parent customInvoices
      reconstructedItems.forEach((item) => {
        onUpdateCode(item.id, item.target, item.target_digits);
        if (item.issuer && onUpdateCompany) {
          onUpdateCompany(item.id, item.issuer);
        }
      });

      // Set state poolItems with natural alphanumeric sorting
      reconstructedItems.sort((a, b) => {
        const titleA = a.title || getItemTitle(a);
        const titleB = b.title || getItemTitle(b);
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
      });
      setPoolItems(reconstructedItems);

      // Trigger parent pool refresh if provided
      if (onRefreshPool) {
        try {
          await onRefreshPool();
        } catch (err) {
          console.warn('onRefreshPool warning:', err);
        }
      }

      const catLabel = getCategoryLabel(category);
      setToastFeedback({
        type: 'success',
        message: `ZIP ဖိုင်မှ ${catLabel} ပုံပေါင်း ${reconstructedItems.length} ပုံနှင့် သတ်မှတ်တန်ဖိုးများကို အောင်မြင်စွာ ပြန်လည် ထည့်သွင်းပြီးပါပြီ။`
      });
    } catch (err: any) {
      console.error('Failed to restore from ZIP:', err);
      setToastFeedback({
        type: 'error',
        message: `ZIP ဖိုင်အား ပြန်လည် ထည့်သွင်းရာတွင် ချို့ယွင်းချက် ဖြစ်ပေါ်ပါသည်: ${err?.message || 'Invalid ZIP'}`
      });
    } finally {
      setIsRestoringZip(false);
      setOperationProgress(null);
    }
  };

  /**
   * Template Generator Logic (downloadCsvTemplate):
   * Generates standard CSV with UTF-8 BOM ("\uFEFF").
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
   * Imports labels and updates active state, LocalStorage mirror, and Supabase.
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
  const catLowerKey = String(category || '').toLowerCase();
  const normCategory: 'tax_number' | 'date_number' | 'phone_number' =
    catLowerKey === 'date' || catLowerKey === 'date_number'
      ? 'date_number'
      : catLowerKey === 'phone' || catLowerKey === 'phone_number'
      ? 'phone_number'
      : 'tax_number';

  const config = {
    tax_number: {
      title: '🧾 Tax Number Data Entry (登録番号)',
      subtitle: 'Transcribe 13-digit Japanese Qualified Invoice Tax Registration Numbers (or 10-digit Registration Numbers) from receipt images.',
      inputRule: "Enter 13 numeric digits (without 'T'). For 10-digit numbers, enter 10 digits.",
      autoAdvance: 'Auto-advances immediately upon matching target length (13 or 10 digits).',
      slaTarget: 'Target speed is under 6.00 seconds per invoice with ≥ 95% accuracy.',
      codePlaceholder: '1234567890123',
      codeLabel: 'Registration Tax Code (13 or 10 numeric digits)',
      extractHint: 'Filename auto-detects 13 numeric digits (e.g. receipt_1234567890123.jpg or receipt_T1234567890123.jpg)',
      slaLimit: '6.00s'
    },
    date_number: {
      title: '📅 Date Number Data Entry (発行年月日 / 取引日)',
      subtitle: 'Transcribe 8-digit Japanese Invoice Transaction Dates (YYYYMMDD) from receipt images.',
      inputRule: 'Enter 8 numeric digits strictly in YYYYMMDD format (e.g. 20260406 for 2026年04月06日).',
      autoAdvance: 'Auto-advances immediately upon reaching exactly 8 numeric digits.',
      slaTarget: 'Target speed is under 4.00 seconds per invoice with ≥ 95% accuracy.',
      codePlaceholder: '20260406',
      codeLabel: '8-Digit Date (YYYYMMDD)',
      extractHint: 'Filename auto-detects 8-digit dates (e.g. receipt_20260406.jpg)',
      slaLimit: '4.00s'
    },
    phone_number: {
      title: '📞 Phone Number Data Entry (電話番号 / TEL)',
      subtitle: 'Transcribe Japanese Contact Telephone Numbers (10 to 11 digits) from receipt images.',
      inputRule: 'Enter numeric digits only (e.g. 0312345678 or 09012345678). Leading zeros are preserved.',
      autoAdvance: 'Auto-advances immediately upon matching expected telephone digit length (10 or 11 digits).',
      slaTarget: 'Target speed is under 5.00 seconds per invoice with ≥ 95% accuracy.',
      codePlaceholder: '0312345678',
      codeLabel: 'Phone Number (10-11 digits)',
      extractHint: 'Filename auto-detects telephone sequences (e.g. receipt_0312345678.jpg)',
      slaLimit: '5.00s'
    }
  }[normCategory];

  const handleFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    try {
      const fileList = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (fileList.length === 0) return;

      const createdItems: PoolItem[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `invoices/${Date.now()}_${i}_${cleanFileName}`;

        // 1. Storage Upload Pipeline:
        // Ensure receipt images upload to the 'invoices' bucket:
        const { data, error } = await supabase.storage
          .from('invoices')
          .upload(filePath, file, { upsert: true });

        // Verify public URL extraction:
        let publicUrl = '';
        if (!error && data) {
          const { data: { publicUrl: extractedUrl } } = supabase.storage
            .from('invoices')
            .getPublicUrl(filePath);
          publicUrl = extractedUrl;
        }

        if (!publicUrl) {
          publicUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(URL.createObjectURL(file));
            reader.readAsDataURL(file);
          });
        }

        // Auto-detect target digits from filename or fallback
        let detectedTarget = '';
        if (category === 'tax_number') {
          const tMatch = file.name.match(/T\d{13}/i);
          if (tMatch) detectedTarget = tMatch[0].replace(/^T/i, '');
          else {
            const d13 = file.name.match(/\d{13}/);
            if (d13) detectedTarget = d13[0];
            else detectedTarget = file.name.replace(/\D/g, '').slice(-13);
          }
        } else if (category === 'date_number') {
          const dMatch = file.name.match(/20\d{6}/) || file.name.match(/\d{8}/);
          detectedTarget = dMatch ? dMatch[0] : file.name.replace(/\D/g, '').slice(0, 8);
        } else if (category === 'phone_number') {
          const pMatch = file.name.match(/0\d{9,10}/) || file.name.match(/\d{10,11}/);
          detectedTarget = pMatch ? pMatch[0] : file.name.replace(/\D/g, '').slice(0, 11);
        }

        if (!detectedTarget) {
          detectedTarget = (customExpectedCode || '').trim().replace(/^T/i, '');
        }

        const verifiedTargetValue = detectedTarget || '1234567890123';
        const targetDigitLength = verifiedTargetValue.replace(/\D/g, '').length || 13;
        const storeName = customCompanyName.trim() || file.name.replace(/\.[^/.]+$/, '').replace(/[_.\-\d]+/g, ' ').trim() || 'Store Receipt';
        const customId = `cust_${category}_${Date.now()}_${i}`;

        // 2. Database Persistence:
        // Insert the verified card directly into 'custom_invoices' table:
        await supabase.from('custom_invoices').insert({
          id: customId,
          image_url: publicUrl,
          custom_image_url: publicUrl,
          target_value: verifiedTargetValue,
          expected_number: verifiedTargetValue,
          target_digit_length: targetDigitLength,
          target_digits: targetDigitLength,
          custom_digit_length: targetDigitLength,
          issuer_name: storeName,
          company_name: storeName,
          category: category,
          invoice_date: new Date().toLocaleDateString('ja-JP'),
          total_amount: `${(2000 + Math.floor(Math.random() * 8000)).toLocaleString()}円`,
          difficulty: 'medium',
          style: 'modern'
        });

        await supabase.from('training_labels').upsert({
          category: category,
          image_identifier: normalizeKey(file.name),
          expected_value: verifiedTargetValue,
          target_value: verifiedTargetValue,
          target_digits: targetDigitLength,
          custom_digit_length: targetDigitLength,
          issuer_or_note: storeName
        }, { onConflict: 'category,image_identifier' });

        createdItems.push({
          id: customId,
          title: file.name,
          customImageUrl: publicUrl,
          target: verifiedTargetValue,
          expectedNumber: verifiedTargetValue,
          target_value: verifiedTargetValue,
          target_digits: targetDigitLength,
          custom_digit_length: targetDigitLength,
          issuer: storeName,
          companyName: storeName,
          category: category,
          invoiceDate: new Date().toLocaleDateString('ja-JP'),
          totalAmount: '2,500円',
          difficulty: 'medium',
          style: 'modern',
          isSynced: true
        });
      }

      setPoolItems((prev) => [...prev, ...createdItems]);

      if (onUploadImages) {
        await onUploadImages(files, category);
      }
      if (onRefreshPool) {
        await onRefreshPool();
      }

      // 3. UI Status Notification:
      // Display a success toast confirming storage upload and table insertion
      setToastFeedback({
        type: 'success',
        message: 'Successfully uploaded to Supabase Storage (invoices) and saved to custom_invoices table'
      });
    } catch (err: any) {
      console.warn('Upload pipeline error:', err);
      setToastFeedback({
        type: 'error',
        message: `Upload error: ${err?.message || 'Failed to complete upload pipeline'}`
      });
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
                className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                aria-expanded={true}
                aria-controls="sandbox-rules-panel"
                aria-label="Hide entry rules and SLA guidelines"
              >
                ✕ Hide Rules
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                aria-expanded={false}
                aria-controls="sandbox-rules-panel"
                aria-label="Show entry rules and SLA guidelines"
              >
                📖 Show Entry Rules & SLA Guidelines
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Guidelines Cards (Collapsible) */}
      {showRules && (
        <div id="sandbox-rules-panel" className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-4 bg-slate-50/90 rounded-2xl border border-slate-200 shadow-2xs transition-all duration-200 animate-fade-in">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" /> 1. Input Rule
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              {config.inputRule}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-pink-500" aria-hidden="true" /> 2. Auto-Advance
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              {config.autoAdvance}
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" /> 3. Performance Timing
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Timing starts precisely when the image displays on screen (<code className="font-mono text-[11px] bg-slate-50 px-1 rounded border border-slate-200">onLoad</code>) and records on final keystroke.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" /> 4. SLA Benchmark
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
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            {toastFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${toastFeedback.type === 'warning' ? 'text-amber-600' : 'text-rose-600'}`} aria-hidden="true" />
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
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer transition shrink-0 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 2. Admin Upload Pool Section OR Trainee Verified Status Banner */}
      {isEffectiveAdmin ? (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-3 gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600 font-bold" /> Upload & Manage Images for Start Training (100 Cards)
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
            role="button"
            tabIndex={0}
            aria-label="Upload custom invoice images. Drop files here or press Enter to browse files"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 ${
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
              aria-label="Choose invoice images to upload"
            />
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                <Upload className="w-5 h-5" aria-hidden="true" />
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
              <label 
                htmlFor="fallback-expected-code"
                id="label-fallback-expected-code"
                className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1"
              >
                Fallback Expected Code (If filename doesn't contain code)
              </label>
              <input
                id="fallback-expected-code"
                name="fallbackExpectedCode"
                aria-labelledby="label-fallback-expected-code"
                type="text"
                inputMode={category === 'phone_number' ? 'tel' : 'numeric'}
                autoComplete="off"
                placeholder={config.codePlaceholder}
                value={customExpectedCode}
                onChange={(e) => setCustomExpectedCode(category === 'tax_number' ? e.target.value.replace(/^T/i, '') : e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-hidden focus:border-indigo-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 font-mono font-bold"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {category === 'tax_number' ? "Enter 13 numeric digits (without 'T')" : `Format: ${config.codeLabel}`}
              </p>
            </div>
            <div>
              <label 
                htmlFor="fallback-issuer-name"
                id="label-fallback-issuer-name"
                className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1"
              >
                Fallback Issuer / Store Name
              </label>
              <input
                id="fallback-issuer-name"
                name="fallbackIssuerName"
                aria-labelledby="label-fallback-issuer-name"
                type="text"
                inputMode="text"
                autoComplete="organization"
                placeholder="e.g. Aeon Retail Co., Ltd."
                value={customCompanyName}
                onChange={(e) => setCustomCompanyName(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 text-xs text-slate-800 rounded-xl outline-hidden focus:border-indigo-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
          </div>

          {/* Catalog List of Loaded Images (Admin Editable Toolbar & Grid) */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1">
                <FileImage className="w-3.5 h-3.5 text-indigo-600" /> Active Pool Images ({sortedPoolItems.length})
              </span>
              
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* 1. Standard CSV Template Download Button */}
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="text-[9px] bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                  title="Download standard CSV label template pre-populated with active pool images"
                  aria-label="Download standard CSV label template pre-populated with active pool images"
                >
                  <Download className="w-3 h-3 text-indigo-600" aria-hidden="true" />
                  <span>Download CSV Template</span>
                </button>

                {/* 2. CSV Import Labels Button */}
                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  className="text-[9px] bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                  title="Import CSV labels to batch update expected transcription values"
                  aria-label="Import CSV labels to batch update expected transcription values"
                >
                  <Upload className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                  <span>Import CSV Labels</span>
                </button>

                {/* Hidden CSV file input */}
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv, text/csv, application/vnd.ms-excel"
                  className="hidden"
                  aria-label="Upload CSV labels file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleCsvImport(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />

                {/* 3. [📦 EXPORT ZIP BACKUP] Button */}
                <button
                  type="button"
                  onClick={handleExportCategoryZip}
                  disabled={isExportingZip}
                  className="text-[9px] bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-200 text-purple-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs disabled:opacity-50 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
                  title="Export complete category ZIP backup including images and manifest.json"
                  aria-label="Export complete category ZIP backup"
                >
                  <Archive className={`w-3 h-3 text-purple-600 ${isExportingZip ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{isExportingZip ? 'Exporting...' : '📦 EXPORT ZIP BACKUP'}</span>
                </button>

                {/* 4. [📥 RESTORE FROM ZIP] Button */}
                <button
                  type="button"
                  onClick={() => zipFileInputRef.current?.click()}
                  disabled={isRestoringZip}
                  className="text-[9px] bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs disabled:opacity-50 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
                  title="Restore category images and verified targets from a backup ZIP file"
                  aria-label="Restore category images and verified targets from a backup ZIP file"
                >
                  <FileArchive className={`w-3 h-3 text-amber-600 ${isRestoringZip ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{isRestoringZip ? 'Restoring...' : '📥 RESTORE FROM ZIP'}</span>
                </button>

                {/* Hidden ZIP file input */}
                <input
                  ref={zipFileInputRef}
                  type="file"
                  accept=".zip, application/zip, application/x-zip-compressed"
                  className="hidden"
                  aria-label="Upload ZIP backup archive file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleRestoreCategoryZip(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />

                {/* 5. Sync/Refresh Pool Button */}
                {onRefreshPool && (
                  <button
                    onClick={async () => {
                      if (onRefreshPool) await onRefreshPool();
                      loadPoolImages(invoices);
                    }}
                    disabled={isRefreshingPool}
                    className="text-[9px] bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 disabled:opacity-50 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1"
                    title="Force refresh custom invoice pool from Supabase"
                    aria-label="Force refresh custom invoice pool from database"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingPool ? 'animate-spin text-indigo-600' : ''}`} aria-hidden="true" />
                    <span>Sync/Refresh Pool</span>
                  </button>
                )}

                {/* 6. Clear Pool Button */}
                {sortedPoolItems.length > 0 && (
                  <button
                    onClick={() => {
                      onClearPool(category);
                      setPoolItems([]);
                    }}
                    className="text-[9px] hover:bg-rose-50 border border-transparent text-rose-600 px-2.5 py-1 rounded-md font-bold cursor-pointer transition uppercase tracking-wider outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1"
                    aria-label="Clear all images from this category pool"
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
                  Drop your custom receipt image files above or restore a <strong className="text-indigo-600 cursor-pointer hover:underline" onClick={() => zipFileInputRef.current?.click()}>ZIP Backup</strong> to populate the training pool with custom images.
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
                          role="button"
                          tabIndex={0}
                          onClick={() => setReviewerModalIndex(idx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setReviewerModalIndex(idx);
                            }
                          }}
                          className="w-12 h-10 border border-slate-200 rounded bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative group-hover:border-indigo-300 shadow-sm outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                          title="Click to zoom & review in modal"
                          aria-label={`Open labeling assistant for invoice ${displayTitle}`}
                        >
                          {inv.customImageUrl ? (
                            <img
                              src={inv.customImageUrl}
                              alt={`Thumbnail for ${displayTitle}`}
                              width={48}
                              height={40}
                              style={{ aspectRatio: '48 / 40' }}
                              loading="lazy"
                              decoding="async"
                              className="object-cover w-full h-full group-hover:scale-105 transition duration-150"
                            />
                          ) : (
                            <FileImage className="w-5 h-5 text-slate-400" aria-hidden="true" />
                          )}
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center justify-center" aria-hidden="true">
                            <Plus className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                        
                        {/* Inline Editable Fields */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <input
                              id={`inline-issuer-${inv.id}`}
                              name={`issuer-${inv.id}`}
                              type="text"
                              inputMode="text"
                              autoComplete="organization"
                              aria-label={`Issuer name for invoice ${displayTitle}`}
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
                              className="w-full text-[10px] font-bold text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0.5 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 transition"
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
                            <label htmlFor={`inline-target-${inv.id}`} className="text-[9px] text-indigo-600 font-mono font-bold shrink-0">
                              Target:
                            </label>
                            <input
                              id={`inline-target-${inv.id}`}
                              name={`target-${inv.id}`}
                              type="text"
                              inputMode={category === 'phone_number' ? 'tel' : 'numeric'}
                              autoComplete="off"
                              aria-label={`Expected target number for invoice ${displayTitle}`}
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
                              className="w-full text-[10px] font-mono text-indigo-700 bg-transparent hover:bg-slate-50 focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-indigo-500 rounded px-1 py-0.5 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 font-bold transition tracking-wider uppercase"
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
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                          title="Open Reviewer Modal"
                        >
                          <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => {
                            onDeleteInvoice(inv.id);
                            setPoolItems(prev => prev.filter(p => p.id !== inv.id));
                          }}
                          aria-label={`Remove invoice ${inv.companyName || inv.id} from pool`}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition shrink-0 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500"
                          title="Remove image from sandbox"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-3 gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5">
                <FileImage className="w-4 h-4 text-emerald-600 font-bold" /> Active Published Training Pool ({sortedPoolItems.length} Cards)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Trainee View: Verified training cards and dynamic digit lengths are automatically synchronized from Supabase backend.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Cloud Synchronized Pool
              </span>
              {onRefreshPool && (
                <button
                  type="button"
                  onClick={async () => {
                    if (onRefreshPool) await onRefreshPool();
                    loadPoolImages(invoices);
                  }}
                  disabled={isRefreshingPool}
                  className="text-[9px] bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold cursor-pointer transition uppercase tracking-wider flex items-center gap-1 shadow-2xs outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                  title="Check for newly verified images from cloud database"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingPool ? 'animate-spin text-indigo-600' : ''}`} aria-hidden="true" />
                  <span>Sync</span>
                </button>
              )}
            </div>
          </div>

          {sortedPoolItems.length === 0 ? (
            <div className="border border-slate-200 rounded-xl p-6 text-center bg-white">
              <p className="text-slate-500 text-xs font-semibold">No published cards available in this category yet</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Training cards verified by an Administrator will automatically appear here once synchronized.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[260px] overflow-y-auto pr-1">
              {sortedPoolItems.map((inv, idx) => {
                const displayTitle = inv.title || getItemTitle(inv);
                const targetDigits = inv.target_digits || inv.custom_digit_length || (inv.target ? inv.target.replace(/\D/g, '').length : 13);
                return (
                  <div key={inv.id} className="flex bg-white border border-slate-200 rounded-lg p-2.5 items-center justify-between group hover:border-emerald-300 transition shadow-2xs">
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-2">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setReviewerModalIndex(idx)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setReviewerModalIndex(idx);
                          }
                        }}
                        className="w-12 h-10 border border-slate-200 rounded bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer shadow-2xs group-hover:border-emerald-400"
                        title="Click to zoom image"
                      >
                        {inv.customImageUrl ? (
                          <img
                            src={inv.customImageUrl}
                            alt={`Receipt preview for ${displayTitle}`}
                            width={48}
                            height={40}
                            style={{ aspectRatio: '48 / 40' }}
                            loading="lazy"
                            decoding="async"
                            className="object-cover w-full h-full group-hover:scale-105 transition duration-150"
                          />
                        ) : (
                          <FileImage className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-slate-800 truncate" title={inv.issuer || inv.companyName || displayTitle}>
                            {inv.issuer || inv.companyName || displayTitle}
                          </span>
                          <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 py-0.2 rounded font-bold" title="Verified in Database">
                            ☁️ Verified
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-slate-400 font-semibold font-mono">Target:</span>
                          <span className="font-mono font-bold text-indigo-700 tracking-wider">
                            {inv.target || inv.expectedNumber || '—'}
                          </span>
                          <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono font-bold border border-indigo-200">
                            {targetDigits} Digits
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Official 100-Card Speed Training (Exclusively based on Admin Uploaded Custom Images) */}
      <div className="border-t border-slate-150 pt-5 space-y-4">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl border border-indigo-500/30 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Official 100-Card Speed Training</span>
            </div>
            <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>Admin Verified Training Pool ({allInvoices.filter(i => !!i.customImageUrl).length} Total Uploaded Invoices)</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed font-sans max-w-xl">
              Typing speed assessments run exclusively on uploaded custom receipt images. No program-generated sample receipts are used.
            </p>
          </div>

          {onStart100CardTest && (
            <button
              type="button"
              onClick={onStart100CardTest}
              disabled={allInvoices.filter(i => !!i.customImageUrl).length === 0}
              className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shrink-0 shadow-md outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                allInvoices.filter(i => !!i.customImageUrl).length > 0
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
              aria-label="Start 100-Card Speed Training with Uploaded Custom Images"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start 100-Card Training</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Reviewer Modal */}
      {reviewerModalIndex !== null && sortedPoolItems[reviewerModalIndex] && (() => {
        const currentInv = sortedPoolItems[reviewerModalIndex];
        const isMatchedFromCsv = !!(matchedCsvMap[currentInv.id] || currentInv.matchedFromCsv);
        const displayIdentifier = matchedCsvMap[currentInv.id] || currentInv.matchedIdentifier || currentInv.title || getItemTitle(currentInv);
        const isItemSynced = currentInv.isSynced || lastSavedId === currentInv.id;

        const handleNextReview = async () => {
          const digitsVal = modalTargetDigits !== '' ? Number(modalTargetDigits) : (modalTarget.replace(/\D/g, '').length || 13);
          const cleanTarget = cleanEnteredTarget(modalTarget, category, digitsVal);
          if (cleanTarget !== currentInv.target || modalIssuer.trim() !== currentInv.issuer || digitsVal !== currentInv.target_digits) {
            await handleSaveVerifyCode(modalTarget, modalIssuer, digitsVal, currentInv);
          }
          if (reviewerModalIndex < sortedPoolItems.length - 1) {
            setReviewerModalIndex(reviewerModalIndex + 1);
          } else {
            setReviewerModalIndex(null);
          }
        };

        const handlePrevReview = async () => {
          const digitsVal = modalTargetDigits !== '' ? Number(modalTargetDigits) : (modalTarget.replace(/\D/g, '').length || 13);
          const cleanTarget = cleanEnteredTarget(modalTarget, category, digitsVal);
          if (cleanTarget !== currentInv.target || modalIssuer.trim() !== currentInv.issuer || digitsVal !== currentInv.target_digits) {
            await handleSaveVerifyCode(modalTarget, modalIssuer, digitsVal, currentInv);
          }
          if (reviewerModalIndex > 0) {
            setReviewerModalIndex(reviewerModalIndex - 1);
          }
        };

        return (
          <div 
            ref={reviewerModalRef}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            id="category-reviewer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviewer-modal-title"
            aria-describedby="reviewer-modal-desc"
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
                  className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition cursor-pointer outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>

                <div className="flex-1 w-full flex items-center justify-center p-2 mb-3 mt-7 overflow-hidden max-h-[380px]">
                  {currentInv.customImageUrl ? (
                    <img 
                      src={currentInv.customImageUrl} 
                      alt={`Receipt image preview for ${displayIdentifier}`} 
                      width={400}
                      height={560}
                      style={{ aspectRatio: '400 / 560' }}
                      className="max-h-full max-w-full rounded shadow-md object-contain border border-slate-850"
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-500">
                      <FileImage className="w-12 h-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
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
                    <p id="reviewer-modal-desc" className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {category === 'date_number' 
                        ? 'Verify the strictly 8-digit transaction date (YYYYMMDD) for this receipt image.'
                        : category === 'phone_number'
                        ? 'Verify telephone contact digits for this receipt image (leading zeros preserved).'
                        : (modalTarget.replace(/\D/g, '').length === 10 || (currentInv.target && currentInv.target.replace(/\D/g, '').length === 10))
                        ? 'Verify 10-digit Registration / Tax No (e.g. 088-632-4959).'
                        : "Enter 13 numeric digits (without 'T') or 10 digits for registration numbers."}
                    </p>
                  </div>

                  {/* Matched Image Identifier Header */}
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
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
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
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      {/* Expected Number (8 columns) */}
                      <div className="sm:col-span-8">
                        <div className="flex items-center justify-between mb-1">
                          <label 
                            htmlFor="modal-expected-target"
                            id="modal-expected-target-label"
                            className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate"
                          >
                            Expected Number <span className="text-rose-500">*</span>
                          </label>
                          {isItemSynced && (
                            <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" aria-hidden="true" /> Persisted
                            </span>
                          )}
                        </div>
                        <input
                          id="modal-expected-target"
                          name="modalExpectedTarget"
                          aria-labelledby="modal-expected-target-label"
                          type="text"
                          inputMode={category === 'phone_number' ? 'tel' : 'numeric'}
                          autoComplete="off"
                          placeholder={
                            category === 'date_number' ? '20260406' :
                            category === 'phone_number' ? '0312345678' :
                            'e.g. 2026720 or 1234567890123'
                          }
                          value={modalTarget}
                          autoFocus
                          onChange={(e) => {
                            const val = category === 'tax_number' ? e.target.value.replace(/^T/i, '') : e.target.value;
                            setModalTarget(val);
                            // By default, auto-populate this length based on the characters typed in the expected number box
                            if (!isDigitsLocked) {
                              const digitsCount = val.replace(/\D/g, '').length;
                              setModalTargetDigits(digitsCount > 0 ? digitsCount : '');
                            }
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              await handleSaveVerifyCode(modalTarget, modalIssuer, modalTargetDigits, currentInv);
                              handleNextReview();
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-300 text-sm text-slate-900 font-mono font-bold rounded-xl outline-hidden focus:bg-white focus:border-indigo-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 tracking-wide text-indigo-700 uppercase"
                        />
                      </div>

                      {/* Target Digits (Length) (4 columns) */}
                      <div className="sm:col-span-4">
                        <div className="flex items-center justify-between mb-1">
                          <label 
                            htmlFor="modal-target-digits"
                            id="modal-target-digits-label"
                            className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest truncate"
                            title="Target Digits (Length)"
                          >
                            Target Digits
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              if (isDigitsLocked) {
                                setIsDigitsLocked(false);
                                const digitsCount = modalTarget.replace(/\D/g, '').length;
                                setModalTargetDigits(digitsCount > 0 ? digitsCount : '');
                              } else {
                                setIsDigitsLocked(true);
                              }
                            }}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition flex items-center gap-0.5 ${
                              isDigitsLocked 
                                ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                            title={isDigitsLocked ? 'Digit length is locked (click to unlock auto-calc)' : 'Auto-calculated (click to lock)'}
                          >
                            {isDigitsLocked ? <><Lock className="w-2.5 h-2.5" /> Locked</> : <><Unlock className="w-2.5 h-2.5" /> Auto</>}
                          </button>
                        </div>
                        <input
                          id="modal-target-digits"
                          name="modalTargetDigits"
                          aria-labelledby="modal-target-digits-label"
                          type="number"
                          min={1}
                          max={30}
                          placeholder="Length"
                          value={modalTargetDigits}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                            setModalTargetDigits(val);
                            setIsDigitsLocked(true); // Allow admin to manually override or lock the digit length
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              await handleSaveVerifyCode(modalTarget, modalIssuer, modalTargetDigits, currentInv);
                              handleNextReview();
                            }
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-300 text-sm text-slate-900 font-mono font-bold rounded-xl outline-hidden focus:bg-white focus:border-indigo-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 text-center"
                        />
                      </div>
                    </div>

                    {/* Quick Override Presets */}
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium">Quick presets:</span>
                      {[7, 8, 10, 13].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setModalTargetDigits(preset);
                            setIsDigitsLocked(true);
                          }}
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border transition cursor-pointer ${
                            modalTargetDigits === preset
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          }`}
                        >
                          {preset}d
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDigitsLocked(false);
                          const digitsCount = modalTarget.replace(/\D/g, '').length;
                          setModalTargetDigits(digitsCount > 0 ? digitsCount : '');
                        }}
                        className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 underline ml-1 cursor-pointer"
                      >
                        Reset auto
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 mt-1">
                      Press <strong className="text-slate-700 font-bold">Enter</strong> to save and proceed to next image.
                    </p>

                    <div>
                      <label 
                        htmlFor="modal-issuer-name"
                        id="modal-issuer-name-label"
                        className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1"
                      >
                        Invoice Issuer / Store Name
                      </label>
                      <input
                        id="modal-issuer-name"
                        name="modalIssuerName"
                        aria-labelledby="modal-issuer-name-label"
                        type="text"
                        inputMode="text"
                        autoComplete="organization"
                        placeholder="e.g. Aeon Retail Co., Ltd."
                        value={modalIssuer}
                        onChange={(e) => setModalIssuer(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            await handleSaveVerifyCode(modalTarget, modalIssuer, modalTargetDigits, currentInv);
                            handleNextReview();
                          }
                        }}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 text-xs text-slate-900 rounded-xl outline-hidden focus:bg-white focus:border-indigo-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                    aria-label="Go to previous invoice image"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" /> Prev
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSavingCode}
                      onClick={() => handleSaveVerifyCode(modalTarget, modalIssuer, modalTargetDigits, currentInv)}
                      aria-label="Save verified transcription target code to Database & Cache"
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50 outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                      title="Save verified transcription target code to Database & Cache"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{isSavingCode ? 'Saving...' : 'Save'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReviewerModalIndex(null)}
                      aria-label="Done reviewing and close modal"
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={handleNextReview}
                      aria-label={reviewerModalIndex < sortedPoolItems.length - 1 ? "Save and proceed to next image" : "Finish review and close modal"}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs outline-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                    >
                      {reviewerModalIndex < sortedPoolItems.length - 1 ? (
                        <>Next <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></>
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

      {/* 4. Progress Indicator Modal during Export/Restore Operations */}
      {operationProgress && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="operation-progress-title"
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${operationProgress.mode === 'export' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'} shrink-0`}>
                {operationProgress.mode === 'export' ? (
                  <Archive className="w-6 h-6 animate-bounce" aria-hidden="true" />
                ) : (
                  <FileArchive className="w-6 h-6 animate-pulse" aria-hidden="true" />
                )}
              </div>
              <div>
                <h3 id="operation-progress-title" className="text-sm font-bold text-slate-800">
                  {operationProgress.mode === 'export' ? '📦 Exporting ZIP Backup' : '📥 Restoring Training Pool from ZIP'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {operationProgress.mode === 'export'
                    ? 'Bundling images and verified manifest.json...'
                    : 'Extracting images, uploading to storage & syncing target values...'}
                </p>
              </div>
            </div>

            {/* Progress Bar & Counter */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-600 font-semibold truncate max-w-[260px]">{operationProgress.statusText}</span>
                <span className="text-indigo-600 font-bold ml-2 shrink-0">{operationProgress.percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={operationProgress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200"
              >
                <div
                  className={`h-full rounded-full transition-all duration-150 ease-out ${
                    operationProgress.mode === 'export'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600'
                  }`}
                  style={{ width: `${Math.max(4, Math.min(100, operationProgress.percent))}%` }}
                />
              </div>
            </div>

            {/* Current Filename Badge */}
            {operationProgress.currentFilename && (
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-[11px] text-slate-600 font-mono truncate flex items-center gap-2">
                <span className="text-slate-400 shrink-0">Current Item:</span>
                <span className="font-bold text-slate-700 truncate">{operationProgress.currentFilename}</span>
              </div>
            )}

            <p className="text-[10px] text-slate-400 text-center font-sans">
              Asynchronous chunking active to maintain smooth browser responsiveness. Please keep this tab open.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySandbox;
