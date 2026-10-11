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

  // Handle URL route resolution
  const resolveRouteFromUrl = useCallback(async () => {
    const path = window.location.pathname;
    const hash = window.location.hash;

    let targetSlug: string | null = null;

    // Check pathname: e.g. /doctors/dr-ahmed
    const pathMatch = path.match(/^\/doctors\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) {
      targetSlug = pathMatch[1];
    } else {
      // Check hash: e.g. #/doctors/dr-ahmed or #doctors/dr-ahmed
      const hashMatch = hash.match(/^#\/?doctors\/([a-zA-Z0-9_-]+)/);
      if (hashMatch && hashMatch[1]) {
        targetSlug = hashMatch[1];
      }
    }

    if (targetSlug) {
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
          <div className="max-w-md w-full bg-white rounded-xl p-6 border border-slate-200 shadow-sm text-center space-y-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              لم يتم العثور على موقع الطبيب المطلوب
            </h2>
            <p className="text-xs text-slate-500 font-mono dir-ltr">
              /doctors/{publicNotFoundSlug}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              تأكد من صحة الرابط أو من قيام المسؤول بنشر الموقع للجمهور عبر لوحة التحكم.
            </p>
            <div className="pt-2">
              <button
                onClick={navigateToDashboard}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 mx-auto"
              >
                <span>العودة للوحة التحكم الرئيسية</span>
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
