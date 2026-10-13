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
  query,
  where,
  limit,
  Firestore,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';

const STORAGE_KEY = 'doctorbrand_cms_doctors_v1';
const FIREBASE_CONFIG_KEY = 'doctorbrand_cms_firebase_config_v1';
const ADMIN_SESSION_KEY = 'doctorbrand_cms_admin_session_v1';

export type DatabaseMode = 'local' | 'firestore';

export interface DatabaseStatus {
  mode: DatabaseMode;
  isCloudConnected: boolean;
  message: string;
  config?: FirebaseConnectionConfig | null;
  lastSyncTime?: string;
}

// Global cached Firestore and Auth instance if active
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
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
    try {
      authInstance = getAuth(app);
    } catch (authErr) {
      console.warn('Firebase Auth initialize warning', authErr);
      authInstance = null;
    }
    return firestoreInstance;
  } catch (e) {
    console.error('Failed to initialize Firebase instance', e);
    firestoreInstance = null;
    authInstance = null;
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

/**
 * Recursively removes all `undefined` values and strips non-serializable fields
 * from an object before sending to Firestore, preventing:
 * "FirebaseError: Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  return JSON.parse(
    JSON.stringify(data, (_, value) => (value === undefined ? null : value))
  ) as T;
}

export type DoctorFetchErrorType =
  | 'not_found'
  | 'not_published'
  | 'permission_denied'
  | 'connection_error'
  | 'firebase_not_configured';

export interface DoctorFetchResult {
  doctor: DoctorProfile | null;
  error?: DoctorFetchErrorType;
  errorMessage?: string;
  source: 'firestore' | 'local';
}

// API methods
export async function getAllDoctors(): Promise<DoctorProfile[]> {
  // Try firestore if active
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      const isAdmin = Boolean(authInstance?.currentUser);
      const list: DoctorProfile[] = [];

      if (isAdmin) {
        // Authenticated admin can list all profiles (published, draft, pending)
        const snapshot = await getDocs(collection(firestoreInstance, 'doctors'));
        snapshot.forEach((d) => {
          list.push(d.data() as DoctorProfile);
        });
      } else {
        // Public visitors query only published profiles to conform to Firestore rules
        const qPublished = query(
          collection(firestoreInstance, 'doctors'),
          where('status', '==', 'published')
        );
        const snapshot = await getDocs(qPublished);
        snapshot.forEach((d) => {
          list.push(d.data() as DoctorProfile);
        });
      }

      if (list.length > 0) {
        // Keep local cache updated
        setLocalDoctors(list);
        return list;
      }
    } catch (e) {
      console.warn('Firestore read failed, falling back to local database cache', e);
    }
  }

  return getLocalDoctors();
}

/**
 * Diagnostic loader for a doctor by slug or id, returning full diagnostic result
 * Handles public visitor access, draft detection, network error differentiation, and local fallback.
 */
export async function fetchDoctorBySlugWithDiagnosis(slug: string): Promise<DoctorFetchResult> {
  if (!slug) {
    return { doctor: null, error: 'not_found', errorMessage: 'لم يتم تحديد رابط الطبيب', source: 'local' };
  }

  let decoded = slug.trim().toLowerCase();
  try {
    decoded = decodeURIComponent(slug).trim().toLowerCase();
  } catch {
    // Keep decoded
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
      s === `dr-${cleanWithoutDr}` ||
      sWithoutDr === cleanWithoutDr ||
      id === clean ||
      id === `doc-${clean}` ||
      id === cleanWithoutDr
    );
  };

  const isAdmin = Boolean(authInstance?.currentUser);

  // 1. Check Cloud Firestore if configured
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      if (isAdmin) {
        // ---------------- ADMIN MODE (Can view published and draft doctors) ----------------
        // A. Direct query by exact slug
        try {
          const q = query(
            collection(firestoreInstance, 'doctors'),
            where('slug', '==', clean),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            return { doctor: snap.docs[0].data() as DoctorProfile, source: 'firestore' };
          }
        } catch (e) {
          console.warn('Admin query by exact slug failed', e);
        }

        // B. Query variation with 'dr-' prefix
        if (clean !== `dr-${cleanWithoutDr}`) {
          try {
            const q = query(
              collection(firestoreInstance, 'doctors'),
              where('slug', '==', `dr-${cleanWithoutDr}`),
              limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              return { doctor: snap.docs[0].data() as DoctorProfile, source: 'firestore' };
            }
          } catch {}
        }

        // C. Direct document get by ID
        try {
          const docRef = doc(firestoreInstance, 'doctors', clean);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            return { doctor: docSnap.data() as DoctorProfile, source: 'firestore' };
          }
        } catch {}

        // D. Full collection scan for admin
        try {
          const allSnap = await getDocs(collection(firestoreInstance, 'doctors'));
          for (const d of allSnap.docs) {
            const docData = d.data() as DoctorProfile;
            if (matchesSlug(docData.slug, docData.id)) {
              return { doctor: docData, source: 'firestore' };
            }
          }
        } catch {}
      } else {
        // ---------------- PUBLIC VISITOR MODE ----------------
        // Must query with status == 'published' to adhere strictly to Firestore security rules
        const queryAttemptErrors: any[] = [];

        // A. Query published doctor by exact slug
        try {
          const q = query(
            collection(firestoreInstance, 'doctors'),
            where('status', '==', 'published'),
            where('slug', '==', clean),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            return { doctor: snap.docs[0].data() as DoctorProfile, source: 'firestore' };
          }
        } catch (err: any) {
          queryAttemptErrors.push(err);
        }

        // B. Query published doctor with 'dr-' prefix variation
        if (clean !== `dr-${cleanWithoutDr}`) {
          try {
            const q = query(
              collection(firestoreInstance, 'doctors'),
              where('status', '==', 'published'),
              where('slug', '==', `dr-${cleanWithoutDr}`),
              limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              return { doctor: snap.docs[0].data() as DoctorProfile, source: 'firestore' };
            }
          } catch (err: any) {
            queryAttemptErrors.push(err);
          }
        }

        // C. Query all published doctors and match in client
        try {
          const qPublished = query(
            collection(firestoreInstance, 'doctors'),
            where('status', '==', 'published')
          );
          const snapPublished = await getDocs(qPublished);
          for (const d of snapPublished.docs) {
            const docData = d.data() as DoctorProfile;
            if (matchesSlug(docData.slug, docData.id)) {
              return { doctor: docData, source: 'firestore' };
            }
          }
        } catch (err: any) {
          queryAttemptErrors.push(err);
        }

        // D. Try direct getDoc by ID
        try {
          const docRef = doc(firestoreInstance, 'doctors', clean);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const docData = docSnap.data() as DoctorProfile;
            if (docData.status === 'published') {
              return { doctor: docData, source: 'firestore' };
            } else {
              return {
                doctor: null,
                error: 'not_published',
                errorMessage: 'هذا الموقع الطبي في وضع المسودة (Draft) ولم يتم نشره للجمهور بعد من قِبل إدارة النظام.',
                source: 'firestore',
              };
            }
          }
        } catch (err: any) {
          if (err?.code === 'permission-denied') {
            // A permission-denied error on getDoc indicates the document exists but status != 'published'
            return {
              doctor: null,
              error: 'not_published',
              errorMessage: 'الموقع الطبي قيد التجهيز والنشر (مسودة غير منشورة). يرجى نشره من لوحة الإدارة.',
              source: 'firestore',
            };
          }
          queryAttemptErrors.push(err);
        }

        // If any error was permission-denied or network error:
        const hasPermissionDenied = queryAttemptErrors.some(
          (e) => e?.code === 'permission-denied' || String(e?.message).includes('permissions')
        );
        const hasNetworkError = queryAttemptErrors.some(
          (e) => e?.code === 'unavailable' || String(e?.message).includes('network') || String(e?.message).includes('offline')
        );

        if (hasNetworkError) {
          return {
            doctor: null,
            error: 'connection_error',
            errorMessage: 'تعذر الاتصال بقاعدة بيانات Firebase السحابية. يرجى التحقق من اتصال الإنترنت.',
            source: 'firestore',
          };
        }

        if (hasPermissionDenied) {
          return {
            doctor: null,
            error: 'permission_denied',
            errorMessage: 'صلاحيات الوصول مقيدة. تأكد من أن الموقع منشور (Published) في لوحة الإدارة.',
            source: 'firestore',
          };
        }
      }
    } catch (e: any) {
      console.warn('Firestore query by slug error', e);
      if (e?.code === 'unavailable' || String(e?.message).includes('network')) {
        return {
          doctor: null,
          error: 'connection_error',
          errorMessage: 'فشل الاتصال بقاعدة البيانات السحابية.',
          source: 'firestore',
        };
      }
    }
  }

  // 2. Check Local Storage cache
  const doctors = getLocalDoctors();
  const found = doctors.find((d) => matchesSlug(d.slug, d.id));
  if (found) {
    if (found.status === 'published' || isAdmin) {
      return { doctor: JSON.parse(JSON.stringify(found)), source: 'local' };
    }
    return {
      doctor: null,
      error: 'not_published',
      errorMessage: 'هذا الموقع الطبي في وضع المسودة (Draft) في المتصفح ولم يُنشر للعامة بعد.',
      source: 'local',
    };
  }

  // 3. Not found anywhere
  return {
    doctor: null,
    error: 'not_found',
    errorMessage: `لم يتم العثور على أي طبيب مرتبط بالرابط: /doctors/${slug}`,
    source: firestoreInstance ? 'firestore' : 'local',
  };
}

export async function getDoctorBySlug(slug: string): Promise<DoctorProfile | null> {
  const result = await fetchDoctorBySlugWithDiagnosis(slug);
  return result.doctor;
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

  // 2. Sync to Firestore if configured (sanitize to ensure zero undefined fields)
  if (firestoreInstance && currentFirebaseConfig) {
    try {
      const sanitized = sanitizeForFirestore(updatedDoctor);
      const docRef = doc(firestoreInstance, 'doctors', updatedDoctor.id);
      await setDoc(docRef, sanitized);
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
        await setDoc(doc(firestoreInstance, 'doctors', d.id), sanitizeForFirestore(d));
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
        await setDoc(doc(firestoreInstance, 'doctors', d.id), sanitizeForFirestore(d));
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
  authInstance = null;
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

// ---------------- Admin Authentication Services ----------------

export interface AdminUser {
  email: string;
  uid: string;
  isFirebaseUser: boolean;
}

// Check initial local session if stored
function getStoredAdminSession(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export function getAdminUser(): AdminUser | null {
  if (authInstance && authInstance.currentUser) {
    const u = authInstance.currentUser;
    return {
      email: u.email || 'admin@doctorbrand.med',
      uid: u.uid,
      isFirebaseUser: true,
    };
  }
  return getStoredAdminSession();
}

export function subscribeToAuthChanges(callback: (user: AdminUser | null) => void): () => void {
  if (authInstance) {
    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      if (user) {
        const admin: AdminUser = {
          email: user.email || 'admin@doctorbrand.med',
          uid: user.uid,
          isFirebaseUser: true,
        };
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
        callback(admin);
      } else {
        const stored = getStoredAdminSession();
        // If stored was marked as firebase user, clear it
        if (stored?.isFirebaseUser) {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          callback(null);
        } else {
          callback(stored);
        }
      }
    });
    return unsubscribe;
  }

  // Local fallback
  callback(getStoredAdminSession());
  return () => {};
}

export async function adminSignIn(email: string, pass: string): Promise<AdminUser> {
  const cleanEmail = email.trim();

  // If Firebase Auth is initialized and configured, try Firebase Auth first
  if (authInstance && currentFirebaseConfig) {
    try {
      const cred = await signInWithEmailAndPassword(authInstance, cleanEmail, pass);
      const user: AdminUser = {
        email: cred.user.email || cleanEmail,
        uid: cred.user.uid,
        isFirebaseUser: true,
      };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(user));
      return user;
    } catch (firebaseErr: unknown) {
      const errCode = (firebaseErr as { code?: string })?.code;
      // If user does not exist yet in Firebase project, attempt initial admin registration
      if (errCode === 'auth/user-not-found' || errCode === 'auth/invalid-credential') {
        try {
          const newCred = await createUserWithEmailAndPassword(authInstance, cleanEmail, pass);
          const user: AdminUser = {
            email: newCred.user.email || cleanEmail,
            uid: newCred.user.uid,
            isFirebaseUser: true,
          };
          localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(user));
          return user;
        } catch {
          // If creation also failed with invalid credential, throw the error
          throw firebaseErr;
        }
      }
      throw firebaseErr;
    }
  }

  // Local Mode Authentication (when no Firebase connected or in offline demo mode)
  // Accepts standard admin credentials or saves new admin credential
  if (!cleanEmail || !pass || pass.length < 4) {
    throw new Error('يرجى إدخال بريد إلكتروني صالح وكلمة مرور لا تقل عن 4 أحرف.');
  }

  const localUser: AdminUser = {
    email: cleanEmail,
    uid: 'local-admin-' + Math.random().toString(36).substring(2, 8),
    isFirebaseUser: false,
  };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(localUser));
  return localUser;
}

export async function adminSignOut(): Promise<void> {
  if (authInstance) {
    try {
      await signOut(authInstance);
    } catch (e) {
      console.warn('Firebase signOut error', e);
    }
  }
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

