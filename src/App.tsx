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
} from './services/storage';
import { Dashboard } from './components/dashboard/Dashboard';
import { DoctorEditor, EditorTab } from './components/editor/DoctorEditor';
import { WebsiteBuilder } from './components/builder/WebsiteBuilder';
import { DoctorWebsite } from './components/public/DoctorWebsite';
import { AlertCircle, ArrowRight, ShieldCheck, Stethoscope } from 'lucide-react';

type AppView = 'dashboard' | 'editor' | 'builder' | 'public_website';

export default function App() {
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorProfile | null>(null);
  const [editorInitialTab, setEditorInitialTab] = useState<EditorTab>('basic');
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>(getDatabaseStatus());
  const [loading, setLoading] = useState(true);
  const [publicNotFoundSlug, setPublicNotFoundSlug] = useState<string | null>(null);

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

  // Preview doctor website
  const handlePreviewDoctor = (doctor: DoctorProfile) => {
    setSelectedDoctor(doctor);
    setCurrentView('public_website');
    window.history.pushState({}, '', `/doctors/${doctor.slug}`);
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

  // View: Public Website
  if (currentView === 'public_website') {
    // 1. Slug not found
    if (!selectedDoctor && publicNotFoundSlug) {
      return (
        <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
          <div className="max-w-lg w-full bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                لم يتم العثور على موقع الطبيب المطلوب
              </h2>
              <p className="text-xs text-slate-500 font-mono dir-ltr mt-1">
                {window.location.origin}/doctors/{publicNotFoundSlug}
              </p>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
              تأكد من صحة الرابط أو من حفظ ونشر الموقع عبر لوحة التحكم. إذا أنشأت الطبيب على جهاز آخر، تأكد من ربط قاعدة بيانات Firebase لمزامنة المواقع سحابياً عبر الإنترنت.
            </p>

            {/* List of Available Registered Doctors */}
            {doctors.length > 0 && (
              <div className="text-right pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                  المواقع المتاحة حالياً على المنصة:
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {doctors.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => navigateToDoctorPublic(d.slug)}
                      className="w-full text-right p-2 rounded-lg bg-slate-50 hover:bg-teal-50 hover:border-teal-200 border border-slate-200/60 transition flex items-center justify-between text-xs group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                          {d.fullName?.charAt(0) || 'ط'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 group-hover:text-teal-800">
                            {d.fullName || 'طبيب بدون اسم'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">{d.specialty}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-teal-600 dir-ltr">
                        /doctors/{d.slug}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                onClick={navigateToDashboard}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <span>لوحة التحكم الرئيسية</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (selectedDoctor) {
      return (
        <DoctorWebsite
          doctor={selectedDoctor}
          isAdminPreview={true}
          onBackToDashboard={navigateToDashboard}
          onEditDoctor={handleEditDoctor}
        />
      );
    }
  }

  // Default View: Admin Dashboard
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
    />
  );
}
