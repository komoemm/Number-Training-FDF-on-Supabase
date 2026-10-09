export type Language = 'my' | 'en';

export interface Translations {
  // App / Brand
  appTitle: string;
  appSubtitle: string;
  appTagline: string;
  systemStatus: string;
  supabaseOnline: string;
  offlineLocal: string;
  logout: string;
  adminBadge: string;
  operatorProfile: string;

  // Language Switcher
  switchLanguage: string;
  myanmarLanguage: string;
  englishLanguage: string;

  // Navigation & Tabs
  allInOneSpeedTraining: string;
  traineeUserAccounts: string;
  categoryImageCatalog: string;
  benchmarkLeaderboard: string;
  loginHistoryLogs: string;
  quickLivePreview: string;

  // Setup / Welcome Card
  welcomeHeading: string;
  welcomeSubtitle: string;
  unlimitedAttempts: string;
  unlimitedAttemptsDesc: string;
  startTraining100: string;
  startTraining: string;
  speedRankingRules: string;
  levelA: string;
  levelADesc: string;
  levelB: string;
  levelBDesc: string;
  levelC: string;
  levelCDesc: string;
  levelD: string;
  levelDDesc: string;
  levelFail: string;
  levelFailDesc: string;

  // Session Rules Box
  rulesHeading: string;
  rule1: string;
  rule2: string;
  rule3: string;
  rule4: string;

  // Active Training Workstation
  cardIndicator: string;
  mistakesLabel: string;
  mistakesAllowed: string;
  elapsedTime: string;
  averageSpeed: string;
  paceIndicator: string;
  onTarget: string;
  needsSpeedup: string;
  disqualifiedNotice: string;
  inputPlaceholder: string;
  cancelSession: string;
  confirmCancelModalTitle: string;
  confirmCancelModalDesc: string;
  continueSession: string;
  abortSession: string;

  // Results Modal
  resultsTitle: string;
  resultsSubtitle: string;
  statusPassed: string;
  statusFailed: string;
  passedNotice: string;
  failedNoticeMistakes: string;
  failedNoticeSpeed: string;
  rankBadgeLabel: string;
  totalTimeLabel: string;
  averageSpeedLabel: string;
  mistakesCountLabel: string;
  accuracyLabel: string;
  toggleErrorReview: string;
  tryAgainBtn: string;
  viewDashboardBtn: string;
  errorReviewTableTitle: string;
  cardIndexCol: string;
  categoryCol: string;
  expectedCol: string;
  typedCol: string;
  statusCol: string;
  noErrorsCongratulations: string;

  // Login Screen
  loginHeading: string;
  loginSubheading: string;
  operatorIdPlaceholder: string;
  passwordPlaceholder: string;
  signInBtn: string;
  quickLoginHeading: string;
  adminPreset: string;
  guestPreset: string;
  traineePreset: string;
  loginErrorEmptyUser: string;
  loginErrorEmptyPass: string;
  loginErrorInvalid: string;

  // Stats & Progress
  progressLabel: string;
  accuracyScore: string;
  currentPace: string;
  targetSla: string;
  speedRank: string;
  bestSpeed: string;

  // Catalog / Sandbox
  catalogTitle: string;
  taxNumberTab: string;
  dateNumberTab: string;
  phoneNumberTab: string;
  exportZipBackup: string;
  restoreFromZip: string;
  exportCsv: string;
  totalImagesCount: string;
  labeledCount: string;
  unlabeledCount: string;

  // Toast / General Notifications
  syncSuccess: string;
  savedOffline: string;
  copiedToClipboard: string;
}

export const translations: Record<Language, Translations> = {
  my: {
    // App / Brand
    appTitle: 'မြန်မာ & ဂျပန် ဘောက်ချာနံပါတ် စာရိုက်စွမ်းရည် လေ့ကျင့်ရေးစနစ်',
    appSubtitle: 'All-In-One အမြန်စာရိုက်စမ်းသပ်မှုနှင့် အရည်အချင်းစစ်ဆေးရေး',
    appTagline: 'တိကျမှုနှင့် အမြန်နှုန်း စံချိန်စံညွှန်း အကဲဖြတ်စနစ်',
    systemStatus: 'စနစ်အခြေအနေ',
    supabaseOnline: '● Supabase.ချိတ်ဆက်မှုရှိ',
    offlineLocal: '● အော့ဖ်လိုင်း.စက်တွင်း',
    logout: 'အကောင့်ထွက်မည်',
    adminBadge: 'အက်ဒမင်',
    operatorProfile: 'အော်ပရေတာ ပရိုဖိုင်',

    // Language Switcher
    switchLanguage: 'ဘာသာစကားပြောင်းလဲရန်',
    myanmarLanguage: 'မြန်မာ',
    englishLanguage: 'English',

    // Navigation & Tabs
    allInOneSpeedTraining: '⚡ All-In-One အမြန်စာရိုက်လေ့ကျင့်မှု',
    traineeUserAccounts: '👥 ဝန်ထမ်းအကောင့်များ စီမံခန့်ခွဲမှု',
    categoryImageCatalog: '📁 ပုံမှတ်တမ်း & အချက်အလက်များ',
    benchmarkLeaderboard: '🏆 စံချိန်မှတ်တမ်း & အဆင့်များ',
    loginHistoryLogs: '📜 ဝင်ရောက်မှုမှတ်တမ်းများ',
    quickLivePreview: '👁️ ပုံစံနမူနာ ကြည့်ရှုရန်',

    // Setup / Welcome Card
    welcomeHeading: 'All-In-One အမြန်စာရိုက်လေ့ကျင့်မှု စတင်ရန်',
    welcomeSubtitle: 'အခွန်နံပါတ်၊ နေ့စွဲနံပါတ်နှင့် ဖုန်းနံပါတ် (၁၀၀) ကတ်ကို Fisher-Yates စနစ်ဖြင့် ရောနှော၍ စက္ကန့်ပိုင်းအတွင်း တိကျစွာ ရိုက်နှိပ်ရမည်။',
    unlimitedAttempts: 'ကန့်သတ်ချက်မရှိ စမ်းသပ်နိုင်သည်',
    unlimitedAttemptsDesc: 'ဝန်ထမ်း ၅၀ ကျော် တစ်ပြိုင်နက်တည်း အကန့်အသတ်မရှိ အကြိမ်ကြိမ် လေ့ကျင့်နိုင်ပါသည်။',
    startTraining100: '⚡ စာရိုက်လေ့ကျင့်မှု စတင်မည် (ကတ် ၁၀၀)',
    startTraining: 'စတင်မည်',
    speedRankingRules: 'အဆင့်သတ်မှတ်ချက် စံချိန်များ (၁ ကတ် ပျမ်းမျှ စက္ကန့်)',
    levelA: 'အဆင့် A (ထူးချွန်)',
    levelADesc: '၂.၃ စက္ကန့် သို့မဟုတ် အောက် (Level A)',
    levelB: 'အဆင့် B (အလွန်ကောင်း)',
    levelBDesc: '၂.၄ စက္ကန့် မှ ၂.၅ စက္ကန့်ကြား',
    levelC: 'အဆင့် C (ကောင်း)',
    levelCDesc: '၂.၆ စက္ကန့် မှ ၃.၀ စက္ကန့်ကြား',
    levelD: 'အဆင့် D (သင့်တင့်)',
    levelDDesc: '၃.၀ စက္ကန့် မှ ၃.၂ စက္ကန့်ကြား',
    levelFail: 'အဆင့်မမီ / ကျရှုံး',
    levelFailDesc: '၃.၂ စက္ကန့်ထက်ကျော်လွန် သို့မဟုတ် အမှား ၂ ခုထက်ပိုခြင်း',

    // Session Rules Box
    rulesHeading: 'စည်းကမ်းချက်များနှင့် စည်းမျဉ်းများ',
    rule1: 'ကတ် ၁၀၀ ကို အစီအစဉ်အတိုင်း ရိုက်နှိပ်ရမည်။',
    rule2: 'အမှား (၂) ကြိမ်အထိသာ ခွင့်ပြုပါမည်။ အမှား (၃) ကြိမ်နှင့်အထက် ရှိပါက အလိုအလျောက် ကျရှုံး (FAIL) မည်။',
    rule3: 'ကတ်တစ်ကတ်ချင်းစီ၏ ပျမ်းမျှကြာချိန်ပေါ် မူတည်၍ Level A မှ D သို့ သတ်မှတ်မည်။',
    rule4: 'Paste (ကူးယူထည့်သွင်းခြင်း) ကို လုံခြုံရေးအရ ပိတ်ပင်ထားပါသည်။',

    // Active Training Workstation
    cardIndicator: 'ကတ် အမှတ်စဉ်',
    mistakesLabel: 'အမှားအရေအတွက်',
    mistakesAllowed: '(အများဆုံး ၂ ကြိမ်)',
    elapsedTime: 'ကြာချိန် စုစုပေါင်း',
    averageSpeed: 'ပျမ်းမျှကြာချိန်',
    paceIndicator: 'လက်ရှိအမြန်နှုန်း',
    onTarget: 'စံချိန်မီနေသည်',
    needsSpeedup: 'မြန်မြန်ရိုက်ရန် လိုအပ်သည်',
    disqualifiedNotice: '⚠️ အမှား ၂ ခုထက် ကျော်လွန်သဖြင့် မအောင်မြင်တော့ပါ (Disqualified)',
    inputPlaceholder: 'ပုံပါ နံပါတ်ကို သေချာကြည့်၍ ရိုက်ထည့်ပါ...',
    cancelSession: 'လေ့ကျင့်မှု ရပ်တန့်မည်',
    confirmCancelModalTitle: 'လေ့ကျင့်မှုကို ရပ်တန့်မှာ သေချာပါသလား?',
    confirmCancelModalDesc: 'လက်ရှိ ရိုက်နှိပ်ထားသော ရလဒ်များနှင့် အချိန်များ သိမ်းဆည်းမည် မဟုတ်ပါ။',
    continueSession: 'ဆက်လက်လေ့ကျင့်မည်',
    abortSession: 'ရပ်တန့်မည်',

    // Results Modal
    resultsTitle: 'All-In-One စာရိုက်စွမ်းရည် စစ်ဆေးမှု ရလဒ်',
    resultsSubtitle: 'ကတ် ၁၀၀ စာရိုက်စမ်းသပ်မှု ပြီးဆုံးပါပြီ။ အသေးစိတ် ရလဒ်ကို အောက်တွင် ကြည့်ရှုပါ။',
    statusPassed: 'အောင်မြင်သည် (PASSED)',
    statusFailed: 'မအောင်မြင်ပါ (FAILED)',
    passedNotice: 'ဂုဏ်ယူပါသည်။ တိကျမှုနှင့် စံချိန်သတ်မှတ်ချက် အောင်မြင်စွာ ပြည့်မီပါသည်။',
    failedNoticeMistakes: 'အမှားအရေအတွက် ၂ ခုထက် ကျော်လွန်သဖြင့် စာရိုက်စမ်းသပ်မှု မအောင်မြင်ပါ။',
    failedNoticeSpeed: 'ပျမ်းမျှကြာချိန် ၃.၂ စက္ကန့်ထက် ကျော်လွန်သဖြင့် စံချိန်မမီပါ။',
    rankBadgeLabel: 'အဆင့်သတ်မှတ်ချက်',
    totalTimeLabel: 'စုစုပေါင်းကြာချိန်',
    averageSpeedLabel: '၁ ကတ် ပျမ်းမျှကြာချိန်',
    mistakesCountLabel: 'အမှားအရေအတွက်',
    accuracyLabel: 'တိကျမှု ရာခိုင်နှုန်း',
    toggleErrorReview: 'မှားယွင်းခဲ့သော ကတ်များ ပြန်လည်စစ်ဆေးရန်',
    tryAgainBtn: '🔄 ထပ်မံ လေ့ကျင့်မည်',
    viewDashboardBtn: '📊 ဒက်ရှ်ဘုတ် ကြည့်မည်',
    errorReviewTableTitle: 'မှားယွင်းခဲ့သော ကတ်များနှင့် အမှန်တန်ဖိုးများ',
    cardIndexCol: 'ကတ်စဉ်',
    categoryCol: 'အမျိုးအစား',
    expectedCol: 'အမှန်တန်ဖိုး',
    typedCol: 'သင်ရိုက်ခဲ့သည်',
    statusCol: 'အခြေအနေ',
    noErrorsCongratulations: '🎉 ကတ် ၁၀၀ လုံး အမှားလုံးဝမရှိဘဲ ၁၀၀% တိကျစွာ ရိုက်နှိပ်နိုင်ခဲ့ပါသည်။',

    // Login Screen
    loginHeading: 'အော်ပရေတာ အကောင့်ဝင်ရောက်ရန်',
    loginSubheading: 'ဒေတာရိုက်သွင်းမှု စာရိုက်စွမ်းရည် လေ့ကျင့်ရေး ပလက်ဖောင်း',
    operatorIdPlaceholder: 'အော်ပရေတာ အမည် (Username)',
    passwordPlaceholder: 'စကားဝှက် (Password)',
    signInBtn: 'အကောင့်ဝင်မည်',
    quickLoginHeading: 'အမြန်ဝင်ရောက်ရန် နမူနာ အကောင့်များ',
    adminPreset: 'အက်ဒမင် (Admin)',
    guestPreset: 'လေ့ကျင့်သူ (Guest)',
    traineePreset: 'လေ့ကျင့်သူ (Trainee)',
    loginErrorEmptyUser: 'ကျေးဇူးပြု၍ အော်ပရေတာ အမည် ထည့်သွင်းပါ။',
    loginErrorEmptyPass: 'ကျေးဇူးပြု၍ စကားဝှက် ထည့်သွင်းပါ။',
    loginErrorInvalid: 'အကောင့်အမည် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်။',

    // Stats & Progress
    progressLabel: 'တိုးတက်မှု အခြေအနေ',
    accuracyScore: 'တိကျမှု',
    currentPace: 'လက်ရှိနှုန်း',
    targetSla: 'သတ်မှတ်စံချိန်',
    speedRank: 'လက်ရှိအဆင့်',
    bestSpeed: 'အကောင်းဆုံး စံချိန်',

    // Catalog / Sandbox
    catalogTitle: 'ကတ်ပုံများနှင့် အညွှန်းတန်ဖိုးများ စီမံခန့်ခွဲမှု',
    taxNumberTab: 'အခွန်နံပါတ် (Tax Number)',
    dateNumberTab: 'နေ့စွဲနံပါတ် (Date Number)',
    phoneNumberTab: 'ဖုန်းနံပါတ် (Phone Number)',
    exportZipBackup: '📦 ZIP BACKUP ထုတ်ယူမည်',
    restoreFromZip: '📥 ZIP မှ ပြန်လည်ထည့်သွင်းမည်',
    exportCsv: '📊 CSV ဖိုင် ထုတ်ယူမည်',
    totalImagesCount: 'စုစုပေါင်း ပုံအရေအတွက်',
    labeledCount: 'တန်ဖိုးသတ်မှတ်ပြီး',
    unlabeledCount: 'တန်ဖိုးမသတ်မှတ်ရသေး',

    // Toast / General Notifications
    syncSuccess: 'အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။',
    savedOffline: 'စက်တွင်း၌ အော့ဖ်လိုင်း သိမ်းဆည်းထားပါသည်။',
    copiedToClipboard: 'ကူးယူပြီးပါပြီ။'
  },
  en: {
    // App / Brand
    appTitle: 'Invoice Number Data Entry Speed Benchmark',
    appSubtitle: 'All-In-One Typing Speed Testing & Certification',
    appTagline: 'Precision & Speed Performance Evaluation System',
    systemStatus: 'System Status',
    supabaseOnline: '● Supabase.Online',
    offlineLocal: '● Offline.Local',
    logout: 'Logout',
    adminBadge: 'Admin',
    operatorProfile: 'Operator Profile',

    // Language Switcher
    switchLanguage: 'Switch Language',
    myanmarLanguage: 'မြန်မာ',
    englishLanguage: 'English',

    // Navigation & Tabs
    allInOneSpeedTraining: '⚡ All-In-One Speed Training',
    traineeUserAccounts: '👥 Trainee User Accounts',
    categoryImageCatalog: '📁 Category Image Catalog',
    benchmarkLeaderboard: '🏆 Benchmark Leaderboard',
    loginHistoryLogs: '📜 Login History Logs',
    quickLivePreview: '👁️ Quick Live Preview',

    // Setup / Welcome Card
    welcomeHeading: 'Start All-In-One Speed Training',
    welcomeSubtitle: '100 randomized cards across Tax, Date, and Phone numbers. Shuffled via Fisher-Yates for realistic speed benchmark.',
    unlimitedAttempts: 'Unlimited Attempts Available',
    unlimitedAttemptsDesc: 'Smoothly supports 50+ concurrent operators with instant restart.',
    startTraining100: '⚡ Start Training (100 Cards)',
    startTraining: 'Start Training',
    speedRankingRules: 'Speed Ranking Evaluation (Average Seconds per Card)',
    levelA: 'Level A (Master)',
    levelADesc: '<= 2.30s per card',
    levelB: 'Level B (Advanced)',
    levelBDesc: '2.40s ~ 2.50s per card',
    levelC: 'Level C (Proficient)',
    levelCDesc: '2.60s ~ 3.00s per card',
    levelD: 'Level D (Standard)',
    levelDDesc: '3.00s ~ 3.20s per card',
    levelFail: 'Failed / Needs Practice',
    levelFailDesc: '> 3.20s or > 2 Mistakes (Disqualified)',

    // Session Rules Box
    rulesHeading: 'Session Guidelines & Strict Rules',
    rule1: 'Complete all 100 cards sequentially without skipping.',
    rule2: 'Maximum allowable mistakes: 2. Exceeding 2 typos results in immediate FAIL status.',
    rule3: 'Final Speed Rank is calculated from your average seconds per card.',
    rule4: 'Pasting text is disabled for anti-cheat verification.',

    // Active Training Workstation
    cardIndicator: 'Card Index',
    mistakesLabel: 'Mistakes',
    mistakesAllowed: '(Max 2 allowed)',
    elapsedTime: 'Total Time',
    averageSpeed: 'Average Speed',
    paceIndicator: 'Current Pace',
    onTarget: 'On Target',
    needsSpeedup: 'Needs Speedup',
    disqualifiedNotice: '⚠️ Exceeded 2 mistakes. Session disqualified (FAIL)',
    inputPlaceholder: 'Carefully type the visible numbers...',
    cancelSession: 'Cancel Training',
    confirmCancelModalTitle: 'Abort current training session?',
    confirmCancelModalDesc: 'Current metrics and progress will be discarded.',
    continueSession: 'Continue Training',
    abortSession: 'Abort Session',

    // Results Modal
    resultsTitle: 'All-In-One Speed Benchmark Results',
    resultsSubtitle: '100-Card test session concluded. Review your verified performance metrics below.',
    statusPassed: 'PASSED',
    statusFailed: 'FAILED',
    passedNotice: 'Congratulations! Speed target and accuracy criteria successfully met.',
    failedNoticeMistakes: 'Disqualified: Exceeded maximum allowed mistakes (Max 2).',
    failedNoticeSpeed: 'Average speed exceeded 3.20 seconds per card.',
    rankBadgeLabel: 'Speed Rank',
    totalTimeLabel: 'Total Elapsed Time',
    averageSpeedLabel: 'Avg Speed / Card',
    mistakesCountLabel: 'Total Mistakes',
    accuracyLabel: 'Accuracy Rate',
    toggleErrorReview: 'Toggle Error Review Details',
    tryAgainBtn: '🔄 Try Again',
    viewDashboardBtn: '📊 View Dashboard',
    errorReviewTableTitle: 'Mismatched Cards & Target Ground Truth',
    cardIndexCol: 'Card #',
    categoryCol: 'Category',
    expectedCol: 'Expected Value',
    typedCol: 'Your Input',
    statusCol: 'Status',
    noErrorsCongratulations: '🎉 Perfect 100/100 accuracy! Zero mistakes recorded.',

    // Login Screen
    loginHeading: 'Operator Authentication',
    loginSubheading: 'Remix Data Entry Typing Speed Benchmark Platform',
    operatorIdPlaceholder: 'Operator ID / Username',
    passwordPlaceholder: 'Account Password',
    signInBtn: 'Sign In to Workstation',
    quickLoginHeading: 'Quick Preset Accounts',
    adminPreset: 'Administrator',
    guestPreset: 'Guest Trainee',
    traineePreset: 'Standard Trainee',
    loginErrorEmptyUser: 'Please enter your Operator ID / Username.',
    loginErrorEmptyPass: 'Please enter your password.',
    loginErrorInvalid: 'Authentication failed. Please check credentials.',

    // Stats & Progress
    progressLabel: 'Session Progress',
    accuracyScore: 'Accuracy',
    currentPace: 'Current Pace',
    targetSla: 'Target SLA',
    speedRank: 'Speed Rank',
    bestSpeed: 'Best Benchmark',

    // Catalog / Sandbox
    catalogTitle: 'Category Image Catalog & Metadata',
    taxNumberTab: 'Tax Number (T+13)',
    dateNumberTab: 'Date Number (8 digits)',
    phoneNumberTab: 'Phone Number (10-11 digits)',
    exportZipBackup: '📦 EXPORT ZIP BACKUP',
    restoreFromZip: '📥 RESTORE FROM ZIP',
    exportCsv: '📊 EXPORT CSV',
    totalImagesCount: 'Total Pool Images',
    labeledCount: 'Labeled & Verified',
    unlabeledCount: 'Pending Label',

    // Toast / General Notifications
    syncSuccess: 'Synced successfully.',
    savedOffline: 'Persisted to local offline storage.',
    copiedToClipboard: 'Copied to clipboard.'
  }
};
