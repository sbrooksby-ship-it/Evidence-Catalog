"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BookOpen, Check, ChevronRight, FileText, Layers3, Search, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Evidence = {
  id: string;
  title: string;
  evidence_type?: string | null;
  description?: string | null;
  status?: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export default function MarketingWorkspace() {
  const [studies, setStudies] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [studyFilter, setStudyFilter] = useState("All studies");
  const [claim, setClaim] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("T2");
  const [evidenceId, setEvidenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadStudies() {
      if (!supabase) {
        setLoadError("Add your Supabase URL and anon key to .env.local to connect the study library.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("evidence")
        .select("id, title, evidence_type, description, status")
        .eq("status", "Active")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) setLoadError(error.message);
      else setStudies((data ?? []) as Evidence[]);
      setLoading(false);
    }
    void loadStudies();
    return () => { active = false; };
  }, []);

  const visibleStudies = useMemo(() => studies.filter((study) => {
    const matchesText = `${study.title} ${study.evidence_type ?? ""} ${study.description ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = studyFilter === "All studies" || study.evidence_type === studyFilter;
    return matchesText && matchesType;
  }), [studies, search, studyFilter]);

  const evidenceTypes = useMemo(() => ["All studies", ...Array.from(new Set(studies.map((item) => item.evidence_type).filter((value): value is string => Boolean(value))))], [studies]);

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      toast.error("Supabase is not configured yet.");
      return;
    }
    if (!claim.trim()) {
      toast.error("Add the campaign copy you want to submit.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("claim_submissions").insert({
      proposed_claim: claim.trim(),
      target_tier: tier,
      submitted_by: email.trim() || "Marketing team",
      human_status: "Pending Review",
      evidence_id: evidenceId || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Your draft could not be submitted", { description: error.message });
      return;
    }
    toast.success("Draft added", { description: "Your claim is ready for the next review step." });
    setClaim("");
    setEmail("");
    setTier("T2");
    setEvidenceId("");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Layers3 size={19} /></div><span className="brand-name">Fieldnotes</span></div>
        <div className="workspace-label">Workspace</div>
        <button className="nav-item active" type="button"><BookOpen aria-hidden="true" />Marketing desk</button>
        <div className="side-bottom"><strong>Campaign workspace</strong>Build clear copy with the research close at hand.</div>
      </aside>

      <main className="main">
        <div className="topline">
          <div className="crumb"><span>Workspace</span><ChevronRight size={13} /><strong>Marketing desk</strong></div>
          <div className="avatar" aria-label="Marketing workspace">MK</div>
        </div>

        <header className="heading">
          <div><p className="eyebrow">Campaign workspace / 01</p><h1>Good claims start<br />with good evidence.</h1><p className="intro">Find the research. Shape the story. Send your draft forward.</p></div>
          <div className="date-chip">MARKETING TEAM · FIELDNOTES</div>
        </header>

        <section className="stats" aria-label="Workspace overview">
          <div className="stat"><div className="metric-label">Available studies <BookOpen /></div><div className="metric-value">{loading ? "—" : studies.length.toString().padStart(2, "0")}</div></div>
          <div className="stat"><div className="metric-label">Evidence types <Layers3 /></div><div className="metric-value">{loading ? "—" : new Set(studies.map((study) => study.evidence_type).filter(Boolean)).size.toString().padStart(2, "0")}</div></div>
          <div className="stat"><div className="metric-label">Drafting status <Sparkles /></div><div className="metric-value" style={{ fontSize: 24, paddingTop: 6 }}>In motion</div></div>
        </section>

        <div className="content-grid">
          <section className="section" aria-labelledby="library-heading">
            <div className="section-head"><div><h2 id="library-heading">Research library</h2><p className="section-note">Active studies available to support your copy.</p></div><span className="count">{visibleStudies.length} RESULTS</span></div>
            <div className="study-tools">
              <label className="search-wrap"><Search aria-hidden="true" /><input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search studies" aria-label="Search studies" /></label>
              <select className="filter-select" value={studyFilter} onChange={(event) => setStudyFilter(event.target.value)} aria-label="Filter by study type">{evidenceTypes.map((type) => <option key={type}>{type}</option>)}</select>
            </div>
            <div className="study-list">
              {loading && <div className="loading">Loading the research library...</div>}
              {!loading && loadError && <div className="error-state">{loadError}</div>}
              {!loading && !loadError && visibleStudies.length === 0 && <div className="empty">No active studies match this search.</div>}
              {!loading && !loadError && visibleStudies.map((study) => (
                <article className="study-row" key={study.id}>
                  <div className="study-icon"><FileText aria-hidden="true" /></div>
                  <div><p className="study-title">{study.title}</p><p className="study-meta">{study.evidence_type || "Study"}{study.description ? ` · ${study.description}` : ""}</p></div>
                  <span className="status"><span className="status-dot" />Active</span>
                </article>
              ))}
            </div>
          </section>

          <section className="section" aria-labelledby="draft-heading">
            <div className="section-head"><div><h2 id="draft-heading">Start a claim draft</h2><p className="section-note">Connect your campaign copy to its supporting study.</p></div></div>
            <div className="form-panel">
              <div className="form-heading"><Sparkles aria-hidden="true" /><h3>Proposed campaign copy</h3></div>
              <form onSubmit={submitClaim}>
                <label className="field"><span className="field-label">Claim text</span><textarea className="textarea" value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Write the exact copy you want to use..." required /></label>
                <div className="form-row">
                  <label className="field"><span className="field-label">Target tier</span><select className="select" value={tier} onChange={(event) => setTier(event.target.value)}><option value="T2">T2 · Substantiated</option><option value="T3">T3 · Qualified</option></select></label>
                  <label className="field"><span className="field-label">Supporting study</span><select className="select" value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Choose a study</option>{studies.map((study) => <option key={study.id} value={study.id}>{study.title}</option>)}</select></label>
                </div>
                <label className="field"><span className="field-label">Work email <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span></span><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>
                <button className="submit-btn" type="submit" disabled={submitting}><Send aria-hidden="true" />{submitting ? "Sending draft..." : "Send draft"}<Check aria-hidden="true" /></button>
                <p className="form-foot">Your draft will be saved with the study you selected.</p>
              </form>
            </div>
          </section>
        </div>
        <footer className="footer"><span>Fieldnotes · Marketing workspace</span><span>Research informed · Copy ready</span></footer>
      </main>
    </div>
  );
}