'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, authFetch } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Toast from '@/components/Toast';
import Footer from '@/components/Footer';

interface UploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
}

interface DispoUploadMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number;
  months: string[];
  products: number;
  stores: number;
}

export default function UploadPage() {
  const { session, loading: authLoading, logout } = useAuth(['super_admin', 'admin']);
  const [uploads, setUploads] = useState<UploadMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // DISPO state
  const [dispoFile, setDispoFile] = useState<File | null>(null);
  const [dispoUploading, setDispoUploading] = useState(false);
  const [dispoUploads, setDispoUploads] = useState<DispoUploadMeta[]>([]);
  const [dispoDragOver, setDispoDragOver] = useState(false);
  const dispoFileRef = useRef<HTMLInputElement>(null);

  // Training state
  const [trainingUploads, setTrainingUploads] = useState<UploadMeta[]>([]);
  const [trainingUploading, setTrainingUploading] = useState(false);
  const [trainingDragOver, setTrainingDragOver] = useState(false);
  const trainingFileRef = useRef<HTMLInputElement>(null);

  // New stores modal
  const [newStoresModal, setNewStoresModal] = useState<string[] | null>(null);

  const loadUploads = useCallback(async () => {
    try {
      const res = await authFetch('/api/visits/uploads');
      if (res.ok) setUploads(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadDispoUploads = useCallback(async () => {
    try {
      const res = await authFetch('/api/dispo');
      if (res.ok) {
        const data = await res.json();
        if (data.uploads) setDispoUploads(data.uploads);
      }
    } catch { /* ignore */ }
  }, []);

  const loadTrainingUploads = useCallback(async () => {
    try {
      const res = await authFetch('/api/training');
      if (res.ok) setTrainingUploads(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (session) {
      loadUploads();
      loadDispoUploads();
      loadTrainingUploads();
    }
  }, [session, loadUploads, loadDispoUploads, loadTrainingUploads]);

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
        const nameInfo = data.sampleRepName ? ` (Sample name: ${data.sampleRepName})` : '';
        setToast({ msg: `Uploaded ${data.rowCount} visit rows${nameInfo}`, type: 'success' });
        loadUploads();
      }
    } catch {
      setToast({ msg: 'Upload failed', type: 'error' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDispoFile(file: File) {
    if (!file.name.match(/\.(xlsx?|xlsb)$/i)) {
      setToast({ msg: 'Please upload an Excel file (.xlsx / .xls / .xlsb)', type: 'error' });
      return;
    }
    setDispoFile(file);
  }

  async function handleDispoUpload() {
    if (!dispoFile) return;
    setDispoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', dispoFile);
      const res = await authFetch('/api/dispo/upload', { method: 'POST', body: fd });
      const result = await res.json();
      if (result.ok) {
        setToast({ msg: `Uploaded ${result.rowCount} rows — ${result.stores} stores, ${result.products} products`, type: 'success' });
        setDispoFile(null);
        if (dispoFileRef.current) dispoFileRef.current.value = '';
        loadDispoUploads();
        // Show new stores popup if any
        if (result.newStoreNames && result.newStoreNames.length > 0) {
          setNewStoresModal(result.newStoreNames);
        }
      } else {
        const debugInfo = result.debug ? `\n${JSON.stringify(result.debug)}` : '';
        setToast({ msg: (result.error || 'Upload failed') + debugInfo, type: 'error' });
      }
    } catch {
      setToast({ msg: 'Upload failed', type: 'error' });
    } finally {
      setDispoUploading(false);
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

  async function handleDispoDelete(id: string) {
    if (!confirm('Delete this DISPO upload? All its data will be removed.')) return;
    try {
      const res = await authFetch(`/api/dispo/delete/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ msg: 'DISPO upload deleted', type: 'success' });
        loadDispoUploads();
      } else {
        const result = await res.json().catch(() => ({}));
        setToast({ msg: result.error || 'Delete failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Delete failed', type: 'error' });
    }
  }

  async function handleTrainingFile(file: File) {
    if (!file.name.match(/\.(xlsx?|csv)$/i)) {
      setToast({ msg: 'Please upload an Excel file (.xlsx / .xls)', type: 'error' });
      return;
    }

    setTrainingUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/training/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Upload failed', type: 'error' });
      } else {
        setToast({ msg: `Uploaded ${data.rowCount} training rows`, type: 'success' });
        loadTrainingUploads();
      }
    } catch {
      setToast({ msg: 'Training upload failed', type: 'error' });
    } finally {
      setTrainingUploading(false);
      if (trainingFileRef.current) trainingFileRef.current.value = '';
    }
  }

  async function handleTrainingDelete(id: string) {
    if (!confirm('Delete this training upload? All its data will be removed.')) return;
    try {
      const res = await authFetch(`/api/training/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToast({ msg: 'Training upload deleted', type: 'success' });
        loadTrainingUploads();
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
      <main style={{ flex: 1, padding: '2rem', minHeight: '100vh' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          Data Upload
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Upload visit data, DISPO sales/stock files, and training form data
        </p>

        {/* === VISIT DATA UPLOAD === */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
            Visit Data (Perigee)
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
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
              borderRadius: 10,
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: uploading ? 'not-allowed' : 'pointer',
              background: dragOver ? 'rgba(0,84,166,0.04)' : '#fafafa',
              transition: 'border-color 0.2s, background 0.2s',
              marginBottom: '1.25rem',
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
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📤</div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4, fontSize: '0.9rem' }}>
              {uploading ? 'Uploading...' : 'Drop Excel file here or click to browse'}
            </div>
            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
              Supports .xlsx and .xls Perigee visit export files
            </div>
          </div>

          {/* Upload history */}
          {uploads.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                Upload History
              </h3>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
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
            </>
          )}
          {uploads.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
              No visit uploads yet
            </div>
          )}
        </div>

        {/* === DISPO DATA UPLOAD === */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
            DISPO — Sales & Stock Data
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Upload weekly DISPO Excel files containing sales, stock on hand, and stock on order data
          </p>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDispoDragOver(true); }}
            onDragLeave={() => setDispoDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDispoDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleDispoFile(file);
            }}
            onClick={() => dispoFileRef.current?.click()}
            style={{
              border: `2px dashed ${dispoDragOver ? '#059669' : '#d1d5db'}`,
              borderRadius: 10,
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: dispoUploading ? 'not-allowed' : 'pointer',
              background: dispoDragOver ? 'rgba(5,150,105,0.04)' : '#fafafa',
              transition: 'border-color 0.2s, background 0.2s',
              marginBottom: '1rem',
              opacity: dispoUploading ? 0.6 : 1,
            }}
          >
            <input
              ref={dispoFileRef}
              type="file"
              accept=".xls,.xlsx,.xlsb"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleDispoFile(file);
              }}
            />
            {dispoFile ? (
              <>
                <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📂</div>
                <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.9rem' }}>{dispoFile.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>
                  {(dispoFile.size / 1024).toFixed(0)} KB — Click to change file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📊</div>
                <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4, fontSize: '0.9rem' }}>
                  Drop DISPO file here or click to browse
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                  Supports .xlsx, .xls and .xlsb DISPO files
                </div>
              </>
            )}
          </div>

          {dispoFile && (
            <button
              className="btn btn-primary"
              onClick={handleDispoUpload}
              disabled={dispoUploading}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {dispoUploading ? 'Uploading & Processing...' : 'Upload DISPO File'}
            </button>
          )}

          {/* Upload history */}
          {dispoUploads.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                Upload History
              </h3>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {dispoUploads.slice().reverse().map(u => (
                  <div
                    key={u.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.8rem' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: '#374151' }}>{u.fileName}</div>
                      <div style={{ color: '#9ca3af', fontSize: '0.7rem' }}>
                        {new Date(u.uploadedAt).toLocaleString('en-ZA')} — {u.rowCount} rows, {u.stores} stores, {u.products} products
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem', flexShrink: 0 }}>
                      <span style={{ color: '#6b7280', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                        {u.months?.join(', ')}
                      </span>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                        onClick={() => handleDispoDelete(u.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {dispoUploads.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
              No DISPO uploads yet
            </div>
          )}
        </div>

        {/* === TRAINING FORM DATA UPLOAD === */}
        <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: '1px solid #e5e7eb', marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
            Training Form Data (Perigee)
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Upload Perigee training form exports. Used for auto-calculating training scores (5 pts).
          </p>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setTrainingDragOver(true); }}
            onDragLeave={() => setTrainingDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setTrainingDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleTrainingFile(file);
            }}
            onClick={() => trainingFileRef.current?.click()}
            style={{
              border: `2px dashed ${trainingDragOver ? '#7c3aed' : '#d1d5db'}`,
              borderRadius: 10,
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: trainingUploading ? 'not-allowed' : 'pointer',
              background: trainingDragOver ? 'rgba(124,58,237,0.04)' : '#fafafa',
              transition: 'border-color 0.2s, background 0.2s',
              marginBottom: '1.25rem',
              opacity: trainingUploading ? 0.6 : 1,
            }}
          >
            <input
              ref={trainingFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleTrainingFile(file);
              }}
            />
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>📋</div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4, fontSize: '0.9rem' }}>
              {trainingUploading ? 'Uploading...' : 'Drop training form Excel here or click to browse'}
            </div>
            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
              Expects columns: Email, Name, Date, Visit UUID, &quot;DID YOU COMPLETE TRAINING?&quot;
            </div>
          </div>

          {/* Upload history */}
          {trainingUploads.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                Upload History
              </h3>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
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
                    {trainingUploads.map(u => (
                      <tr key={u.id}>
                        <td>{u.fileName}</td>
                        <td>{u.rowCount.toLocaleString()}</td>
                        <td>{u.uploadedBy}</td>
                        <td>{new Date(u.uploadedAt).toLocaleString('en-ZA')}</td>
                        <td>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleTrainingDelete(u.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {trainingUploads.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
              No training uploads yet
            </div>
          )}
        </div>

        <Footer />
      </main>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* New Stores Modal */}
      {newStoresModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: '1.5rem', maxWidth: 480, width: '90%',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
              New Stores Detected
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              The following {newStoresModal.length} store{newStoresModal.length > 1 ? 's are' : ' is'} new and need{newStoresModal.length === 1 ? 's' : ''} channel assignment:
            </p>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: '1rem', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              {newStoresModal.map((name, i) => (
                <div key={i} style={{ padding: '0.3rem 0', borderBottom: i < newStoresModal.length - 1 ? '1px solid #f3f4f6' : 'none', fontSize: '0.8rem', color: '#374151' }}>
                  {name}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <a
                href="/admin/stores"
                className="btn btn-primary"
                style={{ textDecoration: 'none', fontSize: '0.8rem' }}
              >
                Assign Channels
              </a>
              <button
                className="btn btn-outline"
                onClick={() => setNewStoresModal(null)}
                style={{ fontSize: '0.8rem' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
