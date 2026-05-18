'use client';

import { useAuth } from '@/lib/useAuth';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import Accordion from '@/components/Accordion';

/* ── Helper components ── */

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: '0.85rem',
        color: '#1e40af',
        margin: '10px 0',
      }}
    >
      {children}
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol style={{ paddingLeft: '1.25rem', margin: '8px 0' }}>
      {steps.map((step, i) => (
        <li key={i} style={{ marginBottom: 6 }}>{step}</li>
      ))}
    </ol>
  );
}

function ScreenshotPlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        border: '2px dashed #d1d5db',
        borderRadius: 8,
        padding: '2rem',
        textAlign: 'center',
        color: '#9ca3af',
        fontSize: '0.85rem',
        margin: '12px 0',
        background: '#f9fafb',
      }}
    >
      [ Screenshot: {label} ]
    </div>
  );
}

/* ── Table of Contents ── */

const SECTIONS = [
  { id: 'getting-started', icon: '🚀', title: 'Getting Started' },
  { id: 'dashboard-overview', icon: '📊', title: 'Dashboard Overview' },
  { id: 'visit-data', icon: '📍', title: 'Loading Visit Data' },
  { id: 'sales-stock', icon: '💰', title: 'Loading Sales & Stock Data (DISPO)' },
  { id: 'training-data', icon: '📋', title: 'Loading Training Data' },
  { id: 'manual-scores', icon: '✏️', title: 'Entering Manual Scores' },
  { id: 'scoring-guide', icon: '📖', title: 'How Scoring Works' },
  { id: 'display-maintenance', icon: '🖥️', title: 'Display Maintenance' },
  { id: 'red-flags', icon: '🚩', title: 'Red Flags' },
  { id: 'perigee-sync', icon: '🔄', title: 'Visit Data & Perigee Sync' },
  { id: 'admin-controls', icon: '⚙️', title: 'Admin Controls' },
  { id: 'email-reminders', icon: '🔔', title: 'Email Reminders' },
];

export default function SiteGuidePage() {
  const { session, loading: authLoading, logout } = useAuth();

  if (authLoading || !session) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b7280' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6' }}>
      <Sidebar role={session.role} name={`${session.name} ${session.surname}`} onLogout={logout} />
      <main style={{ flex: 1, padding: '2rem', marginLeft: 240 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Header */}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', margin: '0 0 0.5rem' }}>
            Site Guide
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 1.5rem' }}>
            A complete walkthrough of the Haier BA Measurement app — how to load data, enter scores, and manage the system.
          </p>

          {/* Table of Contents */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8, color: '#374151' }}>Contents</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
              {SECTIONS.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  style={{
                    color: '#0054A6',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    padding: '3px 0',
                  }}
                >
                  {i + 1}. {s.icon} {s.title}
                </a>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 1. Getting Started */}
            <Accordion title="Getting Started" icon="🚀" id="getting-started" defaultOpen>
              <p>Welcome to the Haier BA Measurement app. This system tracks Brand Ambassador performance across stores using visit data, sales figures, training records, and manual assessments.</p>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 16 }}>Logging In</h3>
              <StepList steps={[
                'Navigate to the site URL provided by your administrator.',
                'Enter your email address and temporary password.',
                'If this is your first login, you will be prompted to change your password.',
                'After setting your new password, you will be redirected to the dashboard.',
              ]} />
              <ScreenshotPlaceholder label="Login page" />
              <InfoBox>If you forget your password, contact an admin to reset it from the Users page.</InfoBox>
            </Accordion>

            {/* 2. Dashboard Overview */}
            <Accordion title="Dashboard Overview" icon="📊" id="dashboard-overview">
              <p>The dashboard provides a high-level view of BA performance:</p>
              <ul style={{ paddingLeft: '1.25rem' }}>
                <li><strong>Leaderboard</strong> — Ranks BAs by their overall score across all KPIs.</li>
                <li><strong>KPI Pages</strong> — Visit Analytics, Training, Sales &amp; Stock, Display Maintenance, and Red Flags each have dedicated pages with charts and data tables.</li>
                <li><strong>Score Entry</strong> — Where admins manually enter BA scores for subjective KPIs.</li>
              </ul>
              <ScreenshotPlaceholder label="Leaderboard page" />
              <InfoBox>Each KPI page shows data filtered by the currently selected month. Use the month picker at the top to switch months.</InfoBox>
            </Accordion>

            {/* 3. Loading Visit Data */}
            <Accordion title="Loading Visit Data" icon="📍" id="visit-data">
              <p>Visit data can be loaded in two ways:</p>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 16 }}>Automatic (Perigee Sync)</h3>
              <p>If Perigee API integration is configured, visit data is automatically imported on a schedule. See the &quot;Visit Data &amp; Perigee Sync&quot; section for details.</p>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 16 }}>Manual Upload</h3>
              <StepList steps={[
                'Go to Control Centre → Data Upload.',
                'Click the Visit Data upload zone.',
                'Select an Excel file (.xlsx) containing visit records.',
                'The system will parse the file, match columns, and show a preview.',
                'Confirm the upload to save the data.',
              ]} />
              <ScreenshotPlaceholder label="Data Upload page — Visit Data zone" />
              <InfoBox>Visit data expects columns like: email/username, store name, check-in date/time, check-out date/time, and forms completed.</InfoBox>
            </Accordion>

            {/* 4. Loading Sales & Stock Data */}
            <Accordion title="Loading Sales & Stock Data (DISPO)" icon="💰" id="sales-stock">
              <p>Sales and stock (DISPO) data measures how well BAs manage product availability in stores.</p>
              <StepList steps={[
                'Go to Control Centre → Data Upload.',
                'Click the DISPO Data upload zone.',
                'Select the DISPO Excel file.',
                'The system will parse and import the records.',
              ]} />
              <ScreenshotPlaceholder label="Data Upload page — DISPO zone" />
              <InfoBox>DISPO stands for &quot;Display, In-Stock, Pricing, Out-of-stock&quot; — standard retail metrics.</InfoBox>
            </Accordion>

            {/* 5. Loading Training Data */}
            <Accordion title="Loading Training Data" icon="📋" id="training-data">
              <p>Training data tracks BA training completion and scores.</p>
              <StepList steps={[
                'Go to Control Centre → Data Upload.',
                'Click the Training Data upload zone.',
                'Select the training Excel file.',
                'Data is matched to BAs by email address.',
              ]} />
              <ScreenshotPlaceholder label="Data Upload page — Training zone" />
            </Accordion>

            {/* 6. Entering Manual Scores */}
            <Accordion title="Entering Manual Scores" icon="✏️" id="manual-scores">
              <p>Some KPIs require manual scoring by admins (e.g. display quality, attitude). The Score Entry page allows admins to enter these scores per BA per month.</p>
              <StepList steps={[
                'Navigate to Score Entry from the sidebar.',
                'Select the month you want to score.',
                'You will see a grid of BAs and KPIs.',
                'Click on a cell to enter or edit a score.',
                'Scores are saved automatically as you type.',
                'The total score updates in real time on the leaderboard.',
              ]} />
              <ScreenshotPlaceholder label="Score Entry page with BA grid" />
              <InfoBox>Only KPIs marked as &quot;manual&quot; in KPI Controls appear on the Score Entry page. Data-driven KPIs (visits, sales, training) are calculated automatically.</InfoBox>
            </Accordion>

            {/* 7. How Scoring Works */}
            <Accordion title="How Scoring Works" icon="📖" id="scoring-guide">
              <p>Each KPI has a weight and scoring rules defined in KPI Controls. The overall BA score is a weighted average of all KPI scores.</p>
              <p>For a detailed breakdown of each KPI&apos;s scoring formula, visit the <a href="/guide" style={{ color: '#0054A6' }}>Scoring Guide</a> page.</p>
              <InfoBox>Admins can adjust KPI weights and thresholds from Control Centre → KPI Controls.</InfoBox>
            </Accordion>

            {/* 8. Display Maintenance */}
            <Accordion title="Display Maintenance" icon="🖥️" id="display-maintenance">
              <p>Display Maintenance tracks how well BAs maintain in-store product displays. This data is uploaded via the Data Upload page.</p>
              <StepList steps={[
                'Go to Control Centre → Data Upload.',
                'Use the Display Data upload zone.',
                'Upload the Excel file containing display audit results.',
              ]} />
              <p>The Display Maintenance KPI page shows a per-BA breakdown with scores and trend charts.</p>
              <ScreenshotPlaceholder label="Display Maintenance KPI page" />
            </Accordion>

            {/* 9. Red Flags */}
            <Accordion title="Red Flags" icon="🚩" id="red-flags">
              <p>Red Flags highlight BAs who have significant performance issues — missed visits, low scores, or compliance problems.</p>
              <StepList steps={[
                'Go to Control Centre → Data Upload to upload red flag data.',
                'The Red Flags KPI page shows flagged BAs with details.',
              ]} />
              <ScreenshotPlaceholder label="Red Flags KPI page" />
            </Accordion>

            {/* 10. Perigee Sync */}
            <Accordion title="Visit Data & Perigee Sync" icon="🔄" id="perigee-sync">
              <p>The app can automatically pull visit data from the Perigee API on a schedule.</p>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 16 }}>How it works</h3>
              <ul style={{ paddingLeft: '1.25rem' }}>
                <li>A Vercel cron job runs every 30 minutes.</li>
                <li>It checks the configured poll schedule (set in Settings → Perigee Schedule).</li>
                <li>If the current time matches a scheduled slot, it calls the Perigee API and imports new visits.</li>
                <li>Duplicate visits are automatically filtered out.</li>
              </ul>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 16 }}>Configuring Perigee</h3>
              <StepList steps={[
                'Go to Control Centre → Settings.',
                'Enter the Perigee API endpoint and API key.',
                'Configure poll time slots (e.g. 08:00 short poll, 22:00 long poll).',
                'Enable the integration.',
              ]} />
              <ScreenshotPlaceholder label="Settings page — Perigee configuration" />
            </Accordion>

            {/* 11. Admin Controls */}
            <Accordion title="Admin Controls" icon="⚙️" id="admin-controls">
              <p>The Control Centre (sidebar section visible to admins) contains all administrative functions:</p>
              <ul style={{ paddingLeft: '1.25rem' }}>
                <li><strong>Data Upload</strong> — Bulk upload visit, DISPO, training, display, red flag, and target data.</li>
                <li><strong>Sales Channels</strong> — Manage retail channels (e.g. Game, Makro, Incredible Connection).</li>
                <li><strong>Stores</strong> — Manage individual store records, assignments, and call cycle indexes.</li>
                <li><strong>BA Management</strong> — View and manage Brand Ambassador profiles and assignments.</li>
                <li><strong>Users</strong> — Create, edit, and delete user accounts. Assign roles (Super Admin, Admin, Client).</li>
                <li><strong>KPI Controls</strong> — Configure KPI weights, thresholds, and scoring modes.</li>
                <li><strong>Roles</strong> — View role definitions (Super Admin only).</li>
                <li><strong>Settings</strong> — Perigee API config, poll schedule, and system settings (Super Admin only).</li>
              </ul>
              <ScreenshotPlaceholder label="Control Centre — Stores page" />
            </Accordion>

            {/* 12. Email Reminders */}
            <Accordion title="Email Reminders" icon="🔔" id="email-reminders">
              <p>Admins can set up automated email reminders to notify users about tasks — loading data, entering scores, etc.</p>
              <StepList steps={[
                'Go to Reminders from the sidebar (admin only).',
                'Click "+ New Reminder" to create a reminder.',
                'Fill in the name, subject, and rich-text email body.',
                'Select TO, CC, and BCC recipients from the user list.',
                'Set the schedule: Daily, Weekly (pick days), Monthly (pick day of month), or Custom interval.',
                'Set the time (SAST) and start/end dates.',
                'Toggle Enabled on to activate the reminder.',
                'The system checks hourly and sends any reminders that are due.',
              ]} />
              <ScreenshotPlaceholder label="Email Reminders page" />
              <InfoBox>Reminders are sent via the Resend email service. The FROM address is the same as all system emails.</InfoBox>
            </Accordion>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
