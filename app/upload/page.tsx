'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';

interface UploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
}

export default function UploadPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [uploads, setUploads] = useState<UploadMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUploads = useCallback(async () => {
    try {
      const res = await authFetch('/api/visits/uploads');
      if (res.ok) setUploads(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) loadUploads();
  }, [session, loadUploads]);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx?|csv)$/i)) {
      setToast({ msg: 'Please upload an Excel file (.xlsx / .xls)', type: 'error' });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/visits/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Upload failed', type: 'error' });
      } else {
        setToast({ msg: `Uploaded ${data.rowCount} visit rows`, type: 'success' });
        loadUploads();
      }
    } catch {
      setToast({ msg: 'Upload failed', type: 'error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this upload? All its visit data will be removed.')) return;
    try {
      const res = await authFetch(`/api/visits/uploads/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ msg: 'Upload deleted', type: 'success' });
        loadUploads();
      } else {
        setToast({ msg: 'Delete failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Delete failed', type: 'error' });
    }
  }

  if (authLoading || !session) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ marginLeft: 240, flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Upload Visits Data
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Upload Perigee visits export files (Excel format)
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#0054A6' : '#d1d5db'}`,
            borderRadius: 12,
            padding: '3rem 2rem',
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: dragOver ? 'rgba(0,84,166,0.04)' : 'white',
            transition: 'border-color 0.2s, background 0.2s',
            marginBottom: '2rem',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📤</div>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            {uploading ? 'Uploading...' : 'Drop Excel file here or click to browse'}
          </div>
          <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
            Supports .xlsx and .xls Perigee visit export files
          </div>
        </div>

        {/* Upload history */}
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem' }}>
          Upload History
        </h2>
        {uploads.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '2rem', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            No uploads yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Rows</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map(u => (
                  <tr key={u.id}>
                    <td>{u.fileName}</td>
                    <td>{u.rowCount.toLocaleString()}</td>
                    <td>{u.uploadedBy}</td>
                    <td>{new Date(u.uploadedAt).toLocaleString('en-ZA')}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => handleDelete(u.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
