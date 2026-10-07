/* Visitor-page strings (English / Arabic). */
export type Lang = 'en' | 'ar';

export const T = {
  en: {
    awards: 'Community Awards', switchTo: 'عربي',
    heroKicker: 'The Maker Collective 2026', heroTitle: 'Pick your favourite makers',
    heroBody: (n: number) => `${n} awards · one vote each · takes under a minute.`,
    name: 'Your name', namePh: 'e.g. Sara Ahmad', number: 'Your number',
    phone: 'Mobile number', phonePh: '07X XXX XXXX', phoneHint: 'We’ll text you a 6-digit code. One phone = one set of votes.',
    consent: 'Keep me posted about future Makerspace events.',
    sendCode: 'Log In', sending: 'Sending…',
    privacy: 'Your name and number are stored securely and only seen by the Makerspace team.',
    qrRequired: 'Scan the current voting QR code on the venue screen to continue. It changes every 20 seconds.',
    otpTitle: 'Enter your code', otpBody: (p: string) => `We sent a 6-digit code to ${p}.`,
    verify: 'Verify', verifying: 'Checking…', resend: 'Resend code', resendIn: (s: number) => `Resend in ${s}s`, changeNumber: 'Change number',
    demoCode: (c: string) => `Demo mode — your code is ${c}`,
    hi: (n: string) => `Hi ${n}`, progress: (a: number, b: number) => `${a} of ${b} votes cast`,
    search: 'Search makers or projects', noMatch: 'No makers match your search.',
    noCategoriesTitle: 'No awards are set up yet', noCategoriesBody: 'Ask the event team to add categories and makers in the admin console, then try again.',
    vote: 'Vote', yourPick: 'Your vote', booth: 'Booth',
    votedBanner: (p: string) => `You voted for ${p}`, votedNote: 'Votes are final — thank you!',
    confirmTitle: 'Confirm your vote', confirmBody: (c: string) => `for ${c}`, confirmNote: 'You can’t change this vote later.',
    confirm: 'Confirm vote', cancel: 'Cancel', casting: 'Voting…',
    recorded: 'Vote recorded ✓', next: 'Next category',
    doneTitle: 'You’re all set!', doneBody: 'Your votes are in. Watch the live results on the big screen.',
    closedTitle: 'Voting is closed', notStarted: 'Voting hasn’t opened yet', closedBody: 'Check back during the event — the Makerspace team will open voting shortly.',
    endedBody: 'Thanks for taking part! Winners will be announced on stage.',
    offTitle: 'Voting is for visitors at the venue', offBody: 'Connect to the event Wi-Fi, or let us check your location to confirm you’re here.',
    useLocation: 'Use my location', locating: 'Checking location…', locDenied: 'Location permission was denied. Enable it in your browser settings, or connect to the event Wi-Fi.',
    locOutside: 'It looks like you’re not at the venue. Connect to the event Wi-Fi and try again.', retry: 'Try again',
    offline: 'You’re offline — we’ll retry when you’re back.', signOut: 'Not you?',
    catDone: 'Done',
  },
  ar: {
    awards: 'جوائز المجتمع', switchTo: 'English',
    heroKicker: 'ملتقى الصُنّاع ٢٠٢٦', heroTitle: 'اختر صُنّاعك المفضّلين',
    heroBody: (n: number) => `${n} جوائز · صوت واحد لكل جائزة · أقل من دقيقة.`,
    name: 'اسمك', namePh: 'مثال: سارة أحمد', number: 'رقمك',
    phone: 'رقم الهاتف', phonePh: '07X XXX XXXX', phoneHint: 'سنرسل لك رمزًا من ٦ أرقام. كل هاتف = مجموعة أصوات واحدة.',
    consent: 'أرغب بمعرفة فعاليات الميكرسبيس القادمة.',
    qrRequired: '\u0627\u0645\u0633\u062d \u0631\u0645\u0632 \u0627\u0644\u062a\u0635\u0648\u064a\u062a \u0627\u0644\u062d\u0627\u0644\u064a \u0639\u0644\u0649 \u0634\u0627\u0634\u0629 \u0627\u0644\u0641\u0639\u0627\u0644\u064a\u0629 \u0644\u0644\u0645\u062a\u0627\u0628\u0639\u0629. \u064a\u062a\u063a\u064a\u0631 \u0643\u0644 5 \u062b\u0648\u0627\u0646\u064d.',
    sendCode: 'تسجيل الدخول', sending: 'جارٍ الإرسال…',
    privacy: 'يتم حفظ اسمك ورقمك بشكل آمن ولا يطّلع عليهما إلا فريق الميكرسبيس.',
    otpTitle: 'أدخل الرمز', otpBody: (p: string) => `أرسلنا رمزًا من ٦ أرقام إلى ${p}.`,
    verify: 'تحقّق', verifying: 'جارٍ التحقق…', resend: 'إعادة إرسال الرمز', resendIn: (s: number) => `إعادة الإرسال بعد ${s} ث`, changeNumber: 'تغيير الرقم',
    demoCode: (c: string) => `وضع العرض — الرمز هو ${c}`,
    hi: (n: string) => `أهلًا ${n}`, progress: (a: number, b: number) => `${a} من ${b} أصوات`,
    search: 'ابحث عن صانع أو مشروع', noMatch: 'لا توجد نتائج مطابقة.',
    noCategoriesTitle: 'لم يتم إعداد الجوائز بعد', noCategoriesBody: 'اطلب من فريق الفعالية إضافة الفئات والصنّاع من لوحة الإدارة، ثم حاول مرة أخرى.',
    vote: 'صوّت', yourPick: 'صوتك', booth: 'جناح',
    votedBanner: (p: string) => `صوّتَّ لـ ${p}`, votedNote: 'الأصوات نهائية — شكرًا لك!',
    confirmTitle: 'تأكيد التصويت', confirmBody: (c: string) => `في فئة ${c}`, confirmNote: 'لا يمكن تغيير هذا الصوت لاحقًا.',
    confirm: 'أكّد التصويت', cancel: 'إلغاء', casting: 'جارٍ التصويت…',
    recorded: 'تم تسجيل صوتك ✓', next: 'الفئة التالية',
    doneTitle: 'تم بنجاح!', doneBody: 'تم تسجيل أصواتك. تابع النتائج المباشرة على الشاشة الكبيرة.',
    closedTitle: 'التصويت مغلق', notStarted: 'لم يبدأ التصويت بعد', closedBody: 'عُد خلال الفعالية — سيفتح فريق الميكرسبيس التصويت قريبًا.',
    endedBody: 'شكرًا لمشاركتك! سيُعلن الفائزون على المسرح.',
    offTitle: 'التصويت متاح لزوّار المكان فقط', offBody: 'اتصل بشبكة الواي فاي الخاصة بالفعالية، أو اسمح لنا بالتحقق من موقعك.',
    useLocation: 'استخدم موقعي', locating: 'جارٍ التحقق من الموقع…', locDenied: 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح أو اتصل بشبكة الفعالية.',
    locOutside: 'يبدو أنك لست في مكان الفعالية. اتصل بشبكة الواي فاي وحاول مجددًا.', retry: 'حاول مجددًا',
    offline: 'أنت غير متصل — سنحاول مجددًا عند عودة الاتصال.', signOut: 'لست أنت؟',
    catDone: 'تم',
  },
};

export type Dict = typeof T.en;
export type Key = keyof Dict;

export function makeT(lang: Lang) {
  return (k: Key, ...args: any[]): string => {
    const v = (T[lang] as any)[k];
    return typeof v === 'function' ? v(...args) : v;
  };
}
