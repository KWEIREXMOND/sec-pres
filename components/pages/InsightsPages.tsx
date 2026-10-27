'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  Download,
  FileBarChart,
  FileText,
  Gauge,
  LockKeyhole,
  RefreshCcw,
  Save,
  Table2,
} from 'lucide-react';
import type { BriefingContent, BriefingPack, ConsolidatedReportRow, Report, ReportContent, ReportSection } from '@/lib/shared-types';
import { apiGet, apiPatch, apiPost, downloadApiFile } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useToast, useWorkspace } from '@/components/providers';
import { dateInputValue, formatDateTime, periodDefaults, titleCase } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, LinkButton, PageHeader, SectionHeader, Select, Spinner, StatusBadge, TableWrap, Tabs, Textarea } from '@/components/ui';

const reportTypes = [
  ['monthly', 'Monthly secretarial report'],
  ['termly', 'Termly activity report'],
  ['annual', 'Annual activity report'],
  ['meeting_attendance', 'Meeting attendance report'],
  ['outstanding_tasks', 'Outstanding task report'],
  ['correspondence_register', 'Correspondence register'],
  ['help_summary', 'HELP request summary'],
  ['executive_decisions', 'Executive decision report'],
  ['handover', 'End-of-tenure handover report'],
];

function emptyReportContent(): ReportContent {
  return { title: '', executive_summary: '', metrics: [], sections: [], limitations: '', source_record_count: 0 };
}

function downloadCsv(rows: ConsolidatedReportRow[], filename: string): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] as unknown as Record<string, unknown>);
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escape((row as unknown as Record<string, unknown>)[key])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportSectionEditor({ section, onChange, disabled }: { section: ReportSection; onChange: (section: ReportSection) => void; disabled?: boolean }) {
  return (
    <Card className="p-4">
      <SectionHeader title={section.title} description="Compiled from saved database records. Edit text before finalization." />
      <div className="mt-3">
        <Field label="Section summary"><Textarea rows={2} value={section.summary} onChange={(event) => onChange({ ...section, summary: event.target.value })} disabled={disabled} /></Field>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="data-table min-w-[640px]">
          <thead><tr>{section.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {section.records.length === 0 && <tr><td colSpan={section.columns.length} className="text-center text-sm text-slate-400">No records in this section for the selected period.</td></tr>}
            {section.records.map((record, rowIndex) => <tr key={rowIndex}>{section.columns.map((column) => <td key={column.key}><Input className="h-8 min-w-28 px-2 py-1 text-xs" disabled={disabled} value={String(record[column.key] ?? '')} onChange={(event) => {
              const nextRecords = section.records.map((item, index) => index === rowIndex ? { ...item, [column.key]: event.target.value } : item);
              onChange({ ...section, records: nextRecords });
            }} /></td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReportEditor({ report, onSaved }: { report: Report; onSaved: () => void }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState(report.title);
  const [summary, setSummary] = useState(report.content.executive_summary);
  const [sections, setSections] = useState<ReportSection[]>(report.content.sections);
  const [limitations, setLimitations] = useState(report.content.limitations);
  const [saving, setSaving] = useState<string | null>(null);
  const locked = report.status === 'final';

  useEffect(() => {
    setTitle(report.title);
    setSummary(report.content.executive_summary);
    setSections(report.content.sections);
    setLimitations(report.content.limitations);
  }, [report]);

  const save = async (finalize = false) => {
    setSaving(finalize ? 'finalize' : 'save');
    try {
      if (finalize) {
        await apiPatch(`/reports/${report.id}`, { title, executiveSummary: summary, sections, limitations, status: 'final' });
        showToast({ title: 'Report finalized', description: 'The report is now read-only and exportable.', tone: 'success' });
      } else {
        await apiPatch(`/reports/${report.id}`, { title, executiveSummary: summary, sections, limitations });
        showToast({ title: 'Draft report saved', tone: 'success' });
      }
      onSaved();
    } catch (error) {
      showToast({ title: 'Report could not be saved', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="stack">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><StatusBadge status={report.status} /><Badge tone="navy">{titleCase(report.report_type)}</Badge></div><h2 className="mt-2 text-xl font-bold text-navy-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{formatDateTime(report.created_at)} • {report.period_start} to {report.period_end} • {report.content.source_record_count} source records</p></div>
          <div className="row-actions"><Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/reports/${report.id}/pdf`, `${title}.pdf`)}>Download PDF</Button>{!locked && <Button loading={saving === 'finalize'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void save(true)}>Finalize report</Button>}</div>
        </div>
        {locked && <div className="mt-4"><Alert tone="info" title="Final report"><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /> This report is locked. Create a new draft from the builder to make changes.</div></Alert></div>}
      </Card>
      <Card className="p-5">
        <SectionHeader title="Editable report content" description="Values were compiled from saved records; verify and edit them before finalization." action={!locked ? <Button loading={saving === 'save'} icon={<Save className="h-4 w-4" />} onClick={() => void save(false)}>Save draft</Button> : undefined} />
        <div className="mt-4 space-y-4">
          <Field label="Report title"><Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={locked} /></Field>
          <Field label="Executive summary"><Textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} disabled={locked} /></Field>
          <Field label="Scope and limitations"><Textarea rows={2} value={limitations} onChange={(event) => setLimitations(event.target.value)} disabled={locked} /></Field>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {report.content.metrics.map((metric) => <div key={metric.label} className="metric-tile"><div className="metric-label">{metric.label}</div><div className="metric-value">{metric.value}</div>{metric.hint && <div className="mt-1 text-xs text-slate-400">{metric.hint}</div>}</div>)}
      </div>
      {sections.map((section, index) => <ReportSectionEditor key={section.key} section={section} disabled={locked} onChange={(next) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} />)}
    </div>
  );
}

export function ReportsPage({ id }: { id?: string }) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const defaults = periodDefaults('month');
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [reportType, setReportType] = useState('monthly');
  const [tab, setTab] = useState(id ? 'saved' : 'builder');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(id || null);
  const overviewPath = `/reports/overview?reportType=${reportType}&periodStart=${periodStart}&periodEnd=${periodEnd}`;
  const { data: overview, loading: overviewLoading, refetch: refreshOverview } = useApiData<{ content: ReportContent }>(tab === 'builder' ? overviewPath : null);
  const { data: saved, loading: savedLoading, refetch: refreshSaved } = useApiData<{ reports: Report[] }>('/reports');
  const { data: selected, refetch: refreshSelected } = useApiData<{ report: Report }>(selectedId ? `/reports/${selectedId}` : null, { enabled: Boolean(selectedId) });
  const consolidatedPath = `/reports/consolidated?periodStart=${periodStart}&periodEnd=${periodEnd}`;
  const { data: consolidated, loading: consolidatedLoading, refetch: refreshConsolidated } = useApiData<{ rows: ConsolidatedReportRow[]; notice: string }>(tab === 'consolidated' && activeWorkspace?.type === 'zonal' ? consolidatedPath : null, { enabled: tab === 'consolidated' && activeWorkspace?.type === 'zonal' });
  const canCompile = Boolean(user?.permissions.includes('compile_reports') || user?.role === 'system_admin');
  const canConsolidate = activeWorkspace?.type === 'zonal' && Boolean(user?.permissions.includes('view_reports') || user?.role === 'system_admin');

  const createReport = async () => {
    if (!activeWorkspace || !canCompile) return;
    setCreating(true);
    try {
      const result = await apiPost<{ report: Report; message: string }>('/reports', { organizationId: activeWorkspace.id, reportType, periodStart, periodEnd });
      showToast({ title: 'Draft report built', description: result.message, tone: 'success' });
      setSelectedId(result.report.id);
      setTab('saved');
      await refreshSaved();
    } catch (error) {
      showToast({ title: 'Report could not be built', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const tabs = [
    { id: 'builder', label: 'Build from records' },
    { id: 'saved', label: 'Saved reports', count: saved?.reports.length },
    ...(canConsolidate ? [{ id: 'consolidated', label: 'Zonal consolidated' }] : []),
  ];

  return (
    <div className="stack">
      <PageHeader eyebrow="Reports & handover" title="Verified reports" description="Conventional report templates populated directly from saved database records. No automated writing service is used." actions={<LinkButton href="/workspace/briefings" variant="outline" icon={<Gauge className="h-4 w-4" />}>Briefing packs</LinkButton>} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'builder' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="p-5 xl:col-span-2">
            <SectionHeader title="Report builder" description="Choose a conventional report type and period." />
            <div className="mt-4 form-grid-3">
              <Field label="Report type"><Select value={reportType} onChange={(event) => setReportType(event.target.value)}>{reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
              <Field label="Period start"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field>
              <Field label="Period end"><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field>
            </div>
            <div className="mt-4 row-actions"><Button variant="outline" icon={<RefreshCcw className="h-4 w-4" />} onClick={refreshOverview}>Refresh preview</Button>{canCompile && <Button loading={creating} icon={<FileBarChart className="h-4 w-4" />} onClick={() => void createReport()}>Build editable draft</Button>}</div>
            {overviewLoading ? <Spinner label="Compiling saved records" /> : overview?.content ? (
              <div className="mt-5 space-y-4">
                <Alert tone="info" title={overview.content.title}>{overview.content.executive_summary}</Alert>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{overview.content.metrics.map((metric) => <div key={metric.label} className="metric-tile"><div className="metric-label">{metric.label}</div><div className="metric-value">{metric.value}</div></div>)}</div>
                <div className="space-y-3">{overview.content.sections.map((section) => <div key={section.key} className="rounded-xl border border-slate-200 p-4"><div className="text-sm font-semibold text-navy-900">{section.title}</div><div className="mt-1 text-xs text-slate-500">{section.summary}</div><div className="mt-2 text-xs text-slate-400">{section.records.length} saved record(s) • columns: {section.columns.map((column) => column.label).join(', ')}</div></div>)}</div>
              </div>
            ) : <EmptyState title="No preview available" description="Choose a valid period and refresh the preview." />}
          </Card>
          <Card className="p-5">
            <SectionHeader title="How reports are built" description="Deterministic queries only." />
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {[
                ['Saved records', 'Meetings, tasks, documents, correspondence and HELP records are queried by organization and period.'],
                ['Editable draft', 'The summary, section notes and record cells can be corrected before finalization.'],
                ['Final record', 'Finalized reports are locked, timestamped and exported by the server PDF generator.'],
                ['Data isolation', 'School records never appear in another school workspace. Zonal views show aggregate counts only.'],
              ].map(([title, description]) => <div key={title} className="rounded-xl bg-slate-50 p-3"><div className="font-semibold text-navy-900">{title}</div><div className="mt-1 text-xs text-slate-500">{description}</div></div>)}
            </div>
          </Card>
        </div>
      )}
      {tab === 'saved' && (
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <Card className="p-4">
            <SectionHeader title="Saved reports" description="Select a draft or final report." />
            <div className="mt-4 space-y-2">
              {savedLoading && <Spinner label="Loading reports" />}
              {(saved?.reports || []).length === 0 && !savedLoading && <div className="text-sm text-slate-400">No saved reports yet.</div>}
              {(saved?.reports || []).map((report) => <button key={report.id} className={`record-row w-full text-left ${selectedId === report.id ? 'border-navy-300 bg-navy-50' : ''}`} onClick={() => setSelectedId(report.id)}><FileText className="h-4 w-4 text-navy-600" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{report.title}</div><div className="text-xs text-slate-400">{titleCase(report.report_type)} • {formatDateTime(report.created_at)}</div></div><StatusBadge status={report.status} /></button>)}
            </div>
          </Card>
          <div>{selected?.report ? <ReportEditor report={selected.report} onSaved={() => { void refreshSelected(); void refreshSaved(); }} /> : <EmptyState title="Select a report" description="Choose a saved report to edit, finalize or download." icon={<FileBarChart className="h-6 w-6" />} />}</div>
        </div>
      )}
      {tab === 'consolidated' && (
        <div className="stack">
          <Alert tone="warning" title="Aggregate-only zonal view">{consolidated?.notice || 'Only aggregate counts from participating organizations are shown.'}</Alert>
          <Card className="p-4"><div className="flex flex-wrap items-end gap-3"><Field label="Period start"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label="Period end"><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field><Button variant="outline" onClick={refreshConsolidated}>Refresh aggregates</Button><Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!consolidated?.rows.length} onClick={() => downloadCsv(consolidated?.rows || [], `consolidated-${periodStart}-${periodEnd}.csv`)}>Download CSV</Button></div></Card>
          {consolidatedLoading ? <Spinner label="Loading consolidated counts" /> : (consolidated?.rows || []).length === 0 ? <EmptyState title="No consolidated records" description="No participating organizations returned counts for this period." /> : (
            <Card className="overflow-hidden"><TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Organization</th><th>Type</th><th>Meetings</th><th>Completed tasks</th><th>Overdue</th><th>New HELP</th><th>Resolved HELP</th><th>Approved docs</th><th>Pending docs</th><th>Correspondence</th></tr></thead><tbody>
              {(consolidated?.rows || []).map((row) => <tr key={row.organization_id}><td><div className="font-semibold text-slate-800">{row.organization_name}</div><div className="text-xs text-slate-400">{row.parent_id ? 'Participating school' : 'Zonal workspace'}</div></td><td>{titleCase(row.organization_type)}</td><td>{row.meeting_count}</td><td>{row.completed_task_count}</td><td>{row.overdue_task_count}</td><td>{row.new_help_count}</td><td>{row.resolved_help_count}</td><td>{row.approved_document_count}</td><td>{row.pending_document_count}</td><td>{row.correspondence_count}</td></tr>)}
            </tbody></table></TableWrap></Card>
          )}
        </div>
      )}
    </div>
  );
}

function BriefingSection({ title, records }: { title: string; records: Array<Record<string, string | number | null>> }) {
  const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record)))).slice(0, 6);
  return (
    <Card className="p-4">
      <SectionHeader title={title} description={`${records.length} saved record(s).`} />
      {records.length === 0 ? <div className="mt-3 text-sm text-slate-400">No records in this section.</div> : (
        <div className="mt-3 overflow-x-auto"><table className="data-table min-w-[640px]"><thead><tr>{columns.map((column) => <th key={column}>{titleCase(column)}</th>)}</tr></thead><tbody>{records.slice(0, 20).map((record, index) => <tr key={index}>{columns.map((column) => <td key={column}>{String(record[column] ?? '—')}</td>)}</tr>)}</tbody></table></div>
      )}
    </Card>
  );
}

function BriefingPreview({ title, content, briefingId }: { title: string; content: BriefingContent; briefingId?: string }) {
  return (
    <div className="stack">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge tone="gold">Presidential briefing pack</Badge><h2 className="mt-2 text-xl font-bold text-navy-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{content.source_record_count} saved records • meetings, tasks, approvals, calendar and HELP requests</p></div>{briefingId && <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/briefings/${briefingId}/pdf`, `${title}.pdf`)}>Download PDF</Button>}</div>
        <p className="mt-4 text-sm leading-6 text-slate-600">{content.overview}</p>
        <div className="mt-4"><h3 className="text-sm font-semibold text-navy-900">Key messages</h3><ul className="mt-2 space-y-2">{content.key_messages.map((message) => <li key={message} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 text-gold-600" />{message}</li>)}</ul></div>
      </Card>
      <BriefingSection title="Meetings" records={content.meetings} />
      <BriefingSection title="Tasks and deadlines" records={content.tasks} />
      <BriefingSection title="Document approvals" records={content.approvals} />
      <BriefingSection title="Calendar entries" records={content.calendar} />
      <BriefingSection title="HELP requests" records={content.help_requests} />
    </div>
  );
}

export function BriefingsPage({ id }: { id?: string }) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const defaults = periodDefaults('fortnight');
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [title, setTitle] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(id || null);
  const overviewPath = `/briefings/overview?periodStart=${periodStart}&periodEnd=${periodEnd}`;
  const { data: overview, loading: overviewLoading, refetch: refreshOverview } = useApiData<{ content: BriefingContent }>(overviewPath);
  const { data: saved, loading: savedLoading, refetch: refreshSaved } = useApiData<{ briefings: BriefingPack[] }>('/briefings');
  const { data: selected, refetch: refreshSelected } = useApiData<{ briefing: BriefingPack }>(selectedId ? `/briefings/${selectedId}` : null, { enabled: Boolean(selectedId) });

  const compile = async () => {
    if (!activeWorkspace) return;
    setCompiling(true);
    try {
      const result = await apiPost<{ briefing: BriefingPack; message: string }>('/briefings', { organizationId: activeWorkspace.id, periodStart, periodEnd, title: title || undefined });
      showToast({ title: 'Briefing pack compiled', description: result.message, tone: 'success' });
      setSelectedId(result.briefing.id);
      await refreshSaved();
    } catch (error) {
      showToast({ title: 'Briefing pack could not be compiled', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setCompiling(false);
    }
  };

  const content = selected?.briefing.content || overview?.content;

  return (
    <div className="stack">
      <PageHeader eyebrow="Presidential briefing packs" title="Briefing packs from saved records" description="Compile a conventional pack from meetings, tasks, approvals, calendar entries and HELP requests." actions={<LinkButton href="/workspace/reports" variant="outline" icon={<BarChart3 className="h-4 w-4" />}>Reports</LinkButton>} />
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <SectionHeader title="Compile a pack" description="Choose a period. Entries are read directly from the database." />
            <div className="mt-4 space-y-3">
              <Field label="Pack title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional custom title" /></Field>
              <div className="form-grid"><Field label="Period start"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label="Period end"><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field></div>
              <div className="row-actions"><Button variant="outline" icon={<RefreshCcw className="h-4 w-4" />} onClick={refreshOverview}>Preview</Button><Button loading={compiling} icon={<Gauge className="h-4 w-4" />} onClick={() => void compile()}>Compile & save</Button></div>
            </div>
          </Card>
          <Card className="p-4">
            <SectionHeader title="Saved packs" description="Select a compiled pack to preview or download." />
            <div className="mt-3 space-y-2">
              {savedLoading && <Spinner label="Loading packs" />}
              {(saved?.briefings || []).length === 0 && !savedLoading && <div className="text-sm text-slate-400">No briefing packs saved yet.</div>}
              {(saved?.briefings || []).map((briefing) => <button key={briefing.id} className={`record-row w-full text-left ${selectedId === briefing.id ? 'border-navy-300 bg-navy-50' : ''}`} onClick={() => setSelectedId(briefing.id)}><Gauge className="h-4 w-4 text-gold-600" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{briefing.title}</div><div className="text-xs text-slate-400">{briefing.period_start} to {briefing.period_end}</div></div></button>)}
            </div>
          </Card>
        </div>
        <div>{overviewLoading && !content ? <Spinner label="Compiling preview from saved records" /> : content ? <BriefingPreview title={selected?.briefing.title || title || content.title} content={content} briefingId={selected?.briefing.id} /> : <EmptyState title="No briefing preview" description="Choose a valid period and compile a pack." icon={<Table2 className="h-6 w-6" />} />}</div>
      </div>
    </div>
  );
}
