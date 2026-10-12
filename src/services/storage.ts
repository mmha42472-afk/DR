import { DoctorProfile, FirebaseConnectionConfig } from '../types/doctor';
import { INITIAL_DEMO_DOCTORS } from '../data/seedDoctors';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  Firestore,
} from 'firebase/firestore';

const STORAGE_KEY = 'doctorbrand_cms_doctors_v1';
const FIREBASE_CONFIG_KEY = 'doctorbrand_cms_firebase_config_v1';

export type DatabaseMode = 'local' | 'firestore';

export interface DatabaseStatus {
  mode: DatabaseMode;
  isCloudConnected: boolean;
  message: string;
  config?: FirebaseConnectionConfig | null;
  lastSyncTime?: string;
}

// Global cached Firestore instance if active
let firestoreInstance: Firestore | null = null;
let currentFirebaseConfig: FirebaseConnectionConfig | null = null;

// Initialize Firebase if config exists in environment or localStorage
export function initFirebaseConfig(): FirebaseConnectionConfig | null {
  try {
    // 1. Check Vite / Vercel Environment Variables
    const envApiKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_API_KEY;
    const envProjectId = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_PROJECT_ID;
    if (envApiKey && envProjectId) {
      const envConfig: FirebaseConnectionConfig = {
        apiKey: envApiKey,
        projectId: envProjectId,
        authDomain: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
        storageBucket: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.appspot.com`,
        messagingSenderId: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_FIREBASE_APP_ID || '',
      };
      setupFirestoreInstance(envConfig);
      currentFirebaseConfig = envConfig;
      return envConfig;
    }

    // 2. Check LocalStorage configuration saved by admin
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (raw) {
      const config = JSON.parse(raw) as FirebaseConnectionConfig;
      if (config.apiKey && config.projectId) {
        setupFirestoreInstance(config);
        currentFirebaseConfig = config;
        return config;
      }
    }
  } catch (e) {
    console.error('Failed reading firebase config', e);
  }
  return null;
}

function setupFirestoreInstance(config: FirebaseConnectionConfig) {
  try {
    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    firestoreInstance = getFirestore(app);
    return firestoreInstance;
  } catch (e) {
    console.error('Failed to initialize Firebase instance', e);
    firestoreInstance = null;
    return null;
  }
}

// Initialize on boot
initFirebaseConfig();

// Local storage helpers
function getLocalDoctors(): DoctorProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed with initial doctors
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_DOCTORS));
      return [...INITIAL_DEMO_DOCTORS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    // If empty array, re-seed
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_DOCTORS));
    return [...INITIAL_DEMO_DOCTORS];
  } catch (err) {
    console.error('Error reading localStorage, reverting to seed', err);
    return [...INITIAL_DEMO_DOCTORS];
  }
}

function setLocalDoctors(doctors: DoctorProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doctors));
}

// API methods
export async function getAllDoctors(): Promise<DoctorProfile[]> {
  // Try firestore if active
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      const snapshot = await getDocs(collection(firestoreInstance, 'doctors'));
      const list: DoctorProfile[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as DoctorProfile);
      });
      if (list.length > 0) {
        // Also keep local cache updated
        setLocalDoctors(list);
        return list;
      }
    } catch (e) {
      console.warn('Firestore read failed, falling back to local database cache', e);
    }
  }

  return getLocalDoctors();
}

export async function getDoctorBySlug(slug: string): Promise<DoctorProfile | null> {
  if (!slug) return null;
  let decoded = slug.trim().toLowerCase();
  try {
    decoded = decodeURIComponent(slug).trim().toLowerCase();
  } catch {
    // Keep raw decoded if decodeURIComponent fails
  }
  const clean = decoded.replace(/^\/+|\/+$/g, '');
  const cleanWithoutDr = clean.replace(/^(dr[-_]|doctor[-_])/, '');

  const matchesSlug = (docSlug?: string, docId?: string) => {
    if (!docSlug && !docId) return false;
    const s = (docSlug || '').toLowerCase().trim();
    const sWithoutDr = s.replace(/^(dr[-_]|doctor[-_])/, '');
    const id = (docId || '').toLowerCase().trim();

    return (
      s === clean ||
      s === `dr-${clean}` ||
      sWithoutDr === cleanWithoutDr ||
      id === clean ||
      id === `doc-${clean}`
    );
  };
  
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      const snapshot = await getDocs(collection(firestoreInstance, 'doctors'));
      for (const d of snapshot.docs) {
        const docData = d.data() as DoctorProfile;
        if (matchesSlug(docData.slug, docData.id)) {
          return docData;
        }
      }
    } catch (e) {
      console.warn('Firestore query by slug failed, checking local storage', e);
    }
  }

  const doctors = getLocalDoctors();
  const found = doctors.find((d) => matchesSlug(d.slug, d.id));
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

export async function getDoctorById(id: string): Promise<DoctorProfile | null> {
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      const docRef = doc(firestoreInstance, 'doctors', id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return snapshot.data() as DoctorProfile;
      }
    } catch (e) {
      console.warn('Firestore getDoc failed, checking local storage', e);
    }
  }

  const doctors = getLocalDoctors();
  const found = doctors.find((d) => d.id === id);
  return found ? JSON.parse(JSON.stringify(found)) : null;
}

export async function saveDoctor(doctor: DoctorProfile): Promise<DoctorProfile> {
  const updatedDoctor: DoctorProfile = {
    ...doctor,
    updatedAt: new Date().toISOString(),
  };

  // 1. Update local storage first
  const doctors = getLocalDoctors();
  const index = doctors.findIndex((d) => d.id === updatedDoctor.id);

  if (index >= 0) {
    doctors[index] = updatedDoctor;
  } else {
    doctors.unshift(updatedDoctor);
  }
  setLocalDoctors(doctors);

  // 2. Sync to Firestore if configured
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      const docRef = doc(firestoreInstance, 'doctors', updatedDoctor.id);
      await setDoc(docRef, updatedDoctor);
    } catch (e) {
      console.error('Firestore save failed', e);
      throw new Error('تم الحفظ في المتصفح بنجاح، ولكن فشل الاتصال بقاعدة بيانات Firebase السحابية: ' + (e instanceof Error ? e.message : 'خطأ غير معروف'));
    }
  }

  return updatedDoctor;
}

export async function deleteDoctor(id: string): Promise<boolean> {
  // 1. Remove from local storage
  const doctors = getLocalDoctors();
  const filtered = doctors.filter((d) => d.id !== id);
  setLocalDoctors(filtered);

  // 2. Remove from Firestore if configured
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      await deleteDoc(doc(firestoreInstance, 'doctors', id));
    } catch (e) {
      console.error('Firestore delete failed', e);
    }
  }

  return true;
}

export async function duplicateDoctor(id: string): Promise<DoctorProfile> {
  const original = await getDoctorById(id);
  if (!original) {
    throw new Error('الطبيب المطلوب غير موجود');
  }

  // Generate unique slug
  let counter = 1;
  let newSlug = `${original.slug}-copy`;
  const existingDoctors = await getAllDoctors();
  while (existingDoctors.some((d) => d.slug.toLowerCase() === newSlug.toLowerCase())) {
    counter++;
    newSlug = `${original.slug}-copy-${counter}`;
  }

  const newDoctor: DoctorProfile = {
    ...JSON.parse(JSON.stringify(original)),
    id: 'doc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    slug: newSlug,
    fullName: `${original.fullName} (نسخة مكررة)`,
    status: 'draft', // duplicated profiles always start as draft
    isDemo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveDoctor(newDoctor);
  return newDoctor;
}

export async function resetDatabaseToDefaults(): Promise<DoctorProfile[]> {
  setLocalDoctors([...INITIAL_DEMO_DOCTORS]);
  
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      for (const d of INITIAL_DEMO_DOCTORS) {
        await setDoc(doc(firestoreInstance, 'doctors', d.id), d);
      }
    } catch (e) {
      console.warn('Failed resetting Firestore to defaults', e);
    }
  }

  return [...INITIAL_DEMO_DOCTORS];
}

export function exportDoctorsToJson(): string {
  const doctors = getLocalDoctors();
  return JSON.stringify(doctors, null, 2);
}

export async function importDoctorsFromJson(jsonStr: string): Promise<number> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new Error('الملف المستورد يجب أن يحتوي على مصفوفة بيانات صالحة.');
    }
    // Basic validation
    for (const item of parsed) {
      if (!item.id || !item.slug || !item.fullName) {
        throw new Error('بيانات الطبيب غير مكتملة في الملف المستورد (يجب توفر الاسم والرابط والمعرف).');
      }
    }
    setLocalDoctors(parsed);

    if (firestoreInstance && currentFirebaseConfig) {
      for (const d of parsed) {
        await setDoc(doc(firestoreInstance, 'doctors', d.id), d);
      }
    }

    return parsed.length;
  } catch (err) {
    throw new Error('خطأ في استيراد البيانات: ' + (err instanceof Error ? err.message : 'تنسيق غير صالح'));
  }
}

// Database mode verification with strict timeout and diagnostics
export async function testAndSaveFirebaseConfig(
  config: FirebaseConnectionConfig
): Promise<{ success: boolean; message: string; step?: string; fixGuide?: string }> {
  try {
    const testAppName = 'test-connection-' + Date.now();
    const testApp = initializeApp(config, testAppName);
    const testDb = getFirestore(testApp);

    // Timeout promise (7 seconds) to prevent hanging indefinitely
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('TIMEOUT_FIRESTORE_STUCK'));
      }, 7000);
    });

    // Test write operation with timeout
    const testDocRef = doc(testDb, 'system', 'connection_test');
    const writePromise = setDoc(testDocRef, {
      testedAt: new Date().toISOString(),
      testedBy: 'DoctorBrand CMS Admin',
    });

    await Promise.race([writePromise, timeoutPromise]);

    // If test write succeeded, save config in localStorage
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
    currentFirebaseConfig = config;
    firestoreInstance = testDb;

    // Sync local doctors to cloud in background
    try {
      const localDocs = getLocalDoctors();
      for (const d of localDocs) {
        await setDoc(doc(testDb, 'doctors', d.id), d);
      }
    } catch (syncErr) {
      console.warn('Initial doctor sync warning', syncErr);
    }

    return {
      success: true,
      message: 'تم الاتصال بقاعدة بيانات Firebase بنجاح، وتمت مزامنة بيانات الأطباء سحابياً!',
    };
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);

    if (errStr.includes('TIMEOUT_FIRESTORE_STUCK')) {
      return {
        success: false,
        step: 'Firestore Database Creation / Connection Hanging',
        message: 'انتهت مهلة الاتصال (Timeout): الخادم علّق ولم يستجب خلال 7 ثوانٍ.',
        fixGuide: 'السبب الشائع: لم يتم إنشاء قاعدة بيانات Cloud Firestore بعد داخل مشروع Firebase Console. انتقل إلى Firebase Console -> Build -> Firestore Database واضغط على "Create database".',
      };
    }

    if (errStr.includes('permission-denied') || errStr.includes('insufficient permissions')) {
      return {
        success: false,
        step: 'Firestore Security Rules',
        message: 'تم رفض الاتصال بسبب قواعد الأمان (Permission Denied).',
        fixGuide: 'قواعد Firestore في الكونسول تمنع الكتابة. افتح Firebase Console -> Firestore Database -> تبويب Rules، والصق محتوى ملف firestore.rules المرفق.',
      };
    }

    if (errStr.includes('failed-precondition') || errStr.includes('not-found') || errStr.includes('Database not found')) {
      return {
        success: false,
        step: 'Firestore Database Not Initialized',
        message: 'قاعدة بيانات Firestore غير موجودة بالمشروع.',
        fixGuide: 'في Firebase Console، افتح Cloud Firestore واضغط على "Create Database" واختر المنطقة الجغرافية (مثل eur3 أو nam5).',
      };
    }

    if (errStr.includes('api-key-not-valid') || errStr.includes('invalid-api-key')) {
      return {
        success: false,
        step: 'Firebase API Key Validation',
        message: 'مفتاح apiKey المدخل غير صالح أو لا ينتمي لهذا المشروع.',
        fixGuide: 'تأكد من نسخ apiKey و projectId من Project Settings -> Web App في Firebase Console.',
      };
    }

    return {
      success: false,
      step: 'General Connection Failure',
      message: `فشل الاتصال: ${errStr}`,
      fixGuide: 'تأكد من تطابق بيانات التكوين وتفعيل Cloud Firestore في وضع الإنتاج أو الاختبار.',
    };
  }
}

export function disconnectFirebase(): void {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
  currentFirebaseConfig = null;
  firestoreInstance = null;
}

export function getDatabaseStatus(): DatabaseStatus {
  if (currentFirebaseConfig && firestoreInstance) {
    return {
      mode: 'firestore',
      isCloudConnected: true,
      message: `متصل بسحابة Firebase Firestore (المشروع: ${currentFirebaseConfig.projectId})`,
      config: currentFirebaseConfig,
    };
  }

  return {
    mode: 'local',
    isCloudConnected: false,
    message: 'النمط التجريبي المحلي (Local Browser Storage) - البيانات محفوظة في ذاكرة المتصفح بأمان.',
    config: null,
  };
}
