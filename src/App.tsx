/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DoctorProfile, FirebaseConnectionConfig } from './types/doctor';
import {
  getAllDoctors,
  getDoctorBySlug,
  saveDoctor,
  deleteDoctor,
  duplicateDoctor,
  resetDatabaseToDefaults,
  exportDoctorsToJson,
  importDoctorsFromJson,
  getDatabaseStatus,
  testAndSaveFirebaseConfig,
  disconnectFirebase,
  DatabaseStatus,
  getAdminUser,
  subscribeToAuthChanges,
  adminSignOut,
  AdminUser,
} from './services/storage';
import { Dashboard } from './components/dashboard/Dashboard';
import { DoctorEditor, EditorTab } from './components/editor/DoctorEditor';
import { WebsiteBuilder } from './components/builder/WebsiteBuilder';
import { DoctorWebsite } from './components/public/DoctorWebsite';
import { AdminLogin } from './components/auth/AdminLogin';
import { AlertCircle, ArrowRight, ShieldCheck, Stethoscope, ArrowLeft } from 'lucide-react';

type AppView = 'dashboard' | 'editor' | 'builder' | 'public_website' | 'admin_preview';

export default function App() {
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorProfile | null>(null);
  const [editorInitialTab, setEditorInitialTab] = useState<EditorTab>('basic');
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>(getDatabaseStatus());
  const [loading, setLoading] = useState(true);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicNotFoundSlug, setPublicNotFoundSlug] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(getAdminUser());

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setAdminUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Load doctors from storage
  const loadDoctors = useCallback(async () => {
    try {
      const list = await getAllDoctors();
      setDoctors(list);
      setDbStatus(getDatabaseStatus());
    } catch (e) {
      console.error('Failed to load doctors', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle URL route resolution with support for /doctors/:slug, /doctor/:slug, /dr/:slug, root /:slug, and query params
  const resolveRouteFromUrl = useCallback(async () => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const search = window.location.search;

    let targetSlug: string | null = null;

    // 1. Check query parameters: ?doctor=dr-ahmed, ?slug=dr-ahmed, or ?d=dr-ahmed
    try {
      const searchParams = new URLSearchParams(search);
      const querySlug = searchParams.get('doctor') || searchParams.get('slug') || searchParams.get('d');
      if (querySlug) {
        targetSlug = querySlug.trim();
      }
    } catch {
      // ignore query parsing errors
    }

    // 2. Check pathname patterns:
    if (!targetSlug) {
      // Check /doctors/:slug or /doctor/:slug or /dr/:slug
      const prefixMatch = path.match(/^\/(?:doctors|doctor|dr)\/([^/?#]+)/i);
      if (prefixMatch && prefixMatch[1]) {
        targetSlug = prefixMatch[1];
      } else {
        // Check single segment root path e.g. /dr-ahmed (excluding reserved words)
        const singleMatch = path.match(/^\/([^/?#]+)/);
        if (singleMatch && singleMatch[1]) {
          const candidate = singleMatch[1].toLowerCase().trim();
          const reserved = [
            'dashboard',
            'admin',
            'builder',
            'editor',
            'api',
            'assets',
            'favicon.ico',
            'index.html',
            'robots.txt',
            'sitemap.xml',
          ];
          if (!reserved.includes(candidate)) {
            targetSlug = singleMatch[1];
          }
        }
      }
    }

    // 3. Check hash patterns: #/doctors/:slug, #doctor/:slug, #/:slug
    if (!targetSlug && hash) {
      const hashPrefixMatch = hash.match(/^#\/?(?:doctors|doctor|dr)\/([^/?#]+)/i);
      if (hashPrefixMatch && hashPrefixMatch[1]) {
        targetSlug = hashPrefixMatch[1];
      } else {
        const hashSingleMatch = hash.match(/^#\/?([^/?#]+)/);
        if (hashSingleMatch && hashSingleMatch[1]) {
          const candidate = hashSingleMatch[1].toLowerCase().trim();
          const reserved = ['dashboard', 'admin', 'builder', 'editor'];
          if (!reserved.includes(candidate)) {
            targetSlug = hashSingleMatch[1];
          }
        }
      }
    }

    if (targetSlug) {
      try {
        targetSlug = decodeURIComponent(targetSlug).trim();
      } catch {
        // Keep targetSlug as-is if decoding fails
      }

      setPublicLoading(true);
      try {
        const doc = await getDoctorBySlug(targetSlug);
        if (doc) {
          setSelectedDoctor(doc);
          setCurrentView('public_website');
          setPublicNotFoundSlug(null);
        } else {
          setPublicNotFoundSlug(targetSlug);
          setSelectedDoctor(null);
          setCurrentView('public_website');
        }
      } finally {
        setPublicLoading(false);
      }
    } else {
      setCurrentView('dashboard');
      setSelectedDoctor(null);
      setPublicNotFoundSlug(null);
    }
  }, []);

  useEffect(() => {
    loadDoctors().then(() => {
      resolveRouteFromUrl();
    });

    const handlePopState = () => {
      resolveRouteFromUrl();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, [loadDoctors, resolveRouteFromUrl]);

  // Navigate to public doctor URL
  const navigateToDoctorPublic = (slug: string) => {
    const newUrl = `/doctors/${slug}`;
    window.history.pushState({}, '', newUrl);
    resolveRouteFromUrl();
  };

  // Navigate to Dashboard
  const navigateToDashboard = () => {
    window.history.pushState({}, '', '/');
    setCurrentView('dashboard');
    setSelectedDoctor(null);
    setPublicNotFoundSlug(null);
  };

  // Create new blank doctor
  const handleAddNewDoctor = () => {
    const newId = 'doc-' + Date.now();
    const blankDoctor: DoctorProfile = {
      id: newId,
      slug: 'dr-' + Math.random().toString(36).substring(2, 7),
      fullName: '',
      specialty: 'استشاري ',
      title: 'أستاذ بكلية الطب - استشاري ',
      photoUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=800',
      bio: '',
      yearsOfExperience: 10,
      qualifications: [
        {
          id: 'q-new-1',
          degree: 'بكالوريوس الطب والجراحة',
          institution: 'كلية الطب - قصر العيني',
          year: '2010',
          verified: true,
        },
      ],
      clinic: {
        name: 'عيادة ',
        address: 'القاهرة، مصر',
        city: 'القاهرة',
        googleMapsUrl: '',
        phone: '',
        whatsapp: '+20',
        workingHours: 'يومياً بالموعد المسبق',
        bookingNote: '',
      },
      services: [
        {
          id: 's-new-1',
          name: 'كشف واستشارة طبية متخصصة',
          description: 'فحص سريري دقيق وتقييم شامل للحالة الصحية مع كتابة البروتوكول العلاجي.',
          tag: 'استشارة',
        },
      ],
      articles: [],
      faqs: [],
      socialMedia: {},
      branding: {
        primaryColor: '#0F2A4A',
        accentColor: '#0D9488',
        fontStyle: 'classic',
      },
      seo: {
        metaTitle: '',
        metaDescription: '',
      },
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemo: false,
    };

    setSelectedDoctor(blankDoctor);
    setEditorInitialTab('basic');
    setCurrentView('editor');
  };

  // Edit existing doctor
  const handleEditDoctor = (doctor: DoctorProfile, tab: EditorTab = 'basic') => {
    setSelectedDoctor(doctor);
    setEditorInitialTab(tab);
    setCurrentView('editor');
  };

  // Open Visual Website Builder for doctor
  const handleOpenBuilder = (doctor: DoctorProfile) => {
    setSelectedDoctor(doctor);
    setCurrentView('builder');
  };

  // Preview doctor website from CMS (retains back to dashboard and edit buttons)
  const handlePreviewDoctor = (doctor: DoctorProfile) => {
    setSelectedDoctor(doctor);
    setCurrentView('admin_preview');
  };

  // Save doctor
  const handleSaveDoctor = async (doctor: DoctorProfile) => {
    const saved = await saveDoctor(doctor);
    setSelectedDoctor(saved);
    await loadDoctors();
  };

  // Delete doctor
  const handleDeleteDoctor = async (id: string) => {
    await deleteDoctor(id);
    await loadDoctors();
  };

  // Duplicate doctor
  const handleDuplicateDoctor = async (id: string) => {
    await duplicateDoctor(id);
    await loadDoctors();
  };

  // Toggle publish / unpublish
  const handleTogglePublish = async (doctor: DoctorProfile) => {
    const newStatus = doctor.status === 'published' ? 'draft' : 'published';
    await saveDoctor({ ...doctor, status: newStatus });
    await loadDoctors();
  };

  // Connect Firebase
  const handleConnectFirebase = async (config: FirebaseConnectionConfig) => {
    const res = await testAndSaveFirebaseConfig(config);
    if (res.success) {
      await loadDoctors();
    }
    return res;
  };

  // Disconnect Firebase
  const handleDisconnectFirebase = () => {
    disconnectFirebase();
    setDbStatus(getDatabaseStatus());
    loadDoctors();
  };

  // Admin Logout
  const handleAdminLogout = async () => {
    await adminSignOut();
    setAdminUser(null);
  };

  // Export & Import
  const handleExportJson = () => {
    const json = exportDoctorsToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctorbrand-cms-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (json: string) => {
    const count = await importDoctorsFromJson(json);
    await loadDoctors();
    return count;
  };

  // Reset defaults
  const handleResetDefaults = async () => {
    if (window.confirm('هل أنت متأكد من إعادة ضبط البيانات للنماذج التجريبية الافتراضية؟')) {
      await resetDatabaseToDefaults();
      await loadDoctors();
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-900 font-sans">
        <div className="text-center space-y-3 p-8 bg-white rounded-xl border border-slate-200/90 shadow-2xs max-w-sm w-full mx-4">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-teal-400 mx-auto flex items-center justify-center">
            <Stethoscope className="w-5 h-5 animate-pulse" />
          </div>
          <h2 className="text-base font-bold text-slate-900">DoctorBrand CMS</h2>
          <p className="text-xs text-slate-500">جارٍ تهيئة نظام إدارة مواقع الأطباء في مصر...</p>
        </div>
      </div>
    );
  }

  // View: Live Editor
  if (currentView === 'editor' && selectedDoctor) {
    return (
      <DoctorEditor
        initialDoctor={selectedDoctor}
        initialTab={editorInitialTab}
        allDoctors={doctors}
        onSave={handleSaveDoctor}
        onCancel={navigateToDashboard}
        onPreviewPublic={handlePreviewDoctor}
      />
    );
  }

  // View: Visual Website Builder
  if (currentView === 'builder' && selectedDoctor) {
    return (
      <WebsiteBuilder
        doctor={selectedDoctor}
        onSaveDraft={async (updated) => {
          await handleSaveDoctor(updated);
        }}
        onPublish={async (updated) => {
          await handleSaveDoctor(updated);
        }}
        onBackToDashboard={navigateToDashboard}
        onOpenPublicUrl={() => navigateToDoctorPublic(selectedDoctor.slug)}
      />
    );
  }

  // View: Public Website (Strict visitor mode - no admin bars, no edit buttons, no dashboard links)
  if (currentView === 'public_website') {
    // 0. Public loading state
    if (publicLoading) {
      return (
        <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
          <div className="text-center space-y-3 p-8 bg-white rounded-2xl border border-slate-200/90 shadow-xs max-w-sm w-full mx-4">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white mx-auto flex items-center justify-center">
              <Stethoscope className="w-5 h-5 animate-pulse" />
            </div>
            <h2 className="text-sm font-bold text-slate-800">جارٍ تحميل موقع الطبيب...</h2>
            <p className="text-xs text-slate-400 font-mono">يرجى الانتظار لحظات</p>
          </div>
        </div>
      );
    }

    // 1. Slug not found (Visitor 404 - clean public error page without admin controls)
    if (!selectedDoctor && publicNotFoundSlug) {
      return (
        <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/90 shadow-sm text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center ring-8 ring-rose-50/50">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">خطأ 404</span>
              <h2 className="text-xl font-bold text-slate-900">
                موقع الطبيب غير متاح
              </h2>
              <p className="text-xs text-slate-400 font-mono dir-ltr">
                {window.location.origin}/doctors/{publicNotFoundSlug}
              </p>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed">
              عذراً، لم نتمكن من العثور على الصفحة المطلوبة. قد يكون الرابط غير صحيح، أو تم تغيير اسم النطاق، أو أن الصفحة قيد التجهيز والنشر.
            </p>

            <div className="pt-2">
              <button
                onClick={() => window.history.back()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>العودة للصفحة السابقة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 2. Doctor found -> Render 100% public patient website (NO admin bar, NO dashboard button)
    if (selectedDoctor) {
      return (
        <DoctorWebsite
          doctor={selectedDoctor}
          isAdminPreview={false}
        />
      );
    }
  }

  // View: Admin Preview (Triggered explicitly from CMS Dashboard/Editor -> contains admin bar and back button)
  if (currentView === 'admin_preview' && selectedDoctor) {
    return (
      <DoctorWebsite
        doctor={selectedDoctor}
        isAdminPreview={true}
        onBackToDashboard={navigateToDashboard}
        onEditDoctor={handleEditDoctor}
      />
    );
  }

  // ---------------- Protected CMS Area (Admin Login Required) ----------------
  if (!adminUser) {
    return (
      <AdminLogin
        onSuccess={(user) => setAdminUser(user)}
      />
    );
  }

  // Default View: Admin Dashboard (Authenticated Admin)
  return (
    <Dashboard
      doctors={doctors}
      dbStatus={dbStatus}
      onAddDoctor={handleAddNewDoctor}
      onEditDoctor={handleEditDoctor}
      onOpenBuilder={handleOpenBuilder}
      onPreviewDoctor={handlePreviewDoctor}
      onDuplicateDoctor={handleDuplicateDoctor}
      onDeleteDoctor={handleDeleteDoctor}
      onTogglePublish={handleTogglePublish}
      onOpenPublicUrl={navigateToDoctorPublic}
      onConnectFirebase={handleConnectFirebase}
      onDisconnectFirebase={handleDisconnectFirebase}
      onExportJson={handleExportJson}
      onImportJson={handleImportJson}
      onResetDefaults={handleResetDefaults}
      currentAdmin={adminUser}
      onLogout={handleAdminLogout}
    />
  );
}
