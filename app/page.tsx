"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Layers3,
  Link2,
  PencilLine,
  Search,
  Send,
} from "lucide-react";
import { toast } from "sonner";

type Evidence = {
  id: string;
  title: string;
  evidence_type?: string | null;
  description?: string | null;
  status?: string | null;
  fit_score?: number;
};

const SAMPLE_STUDIES: Evidence[] = [
  { id: "sample-hydration", title: "12-week hydration efficacy trial", evidence_type: "Clinical Trial", description: "+38% skin moisture · n = 240 · 2025", fit_score: 86 },
  { id: "sample-consumer-texture", title: "Consumer perception panel — texture", evidence_type: "Consumer Research", description: "9 in 10 prefer feel · n = 500 · 2026", fit_score: 42 },
  { id: "sample-ingredient-stability", title: "Ingredient stability under heat", evidence_type: "Lab Assay", description: "Stable to 45°C · n = 36 · 2024", fit_score: 72 },
  { id: "sample-wear-test", title: "Real-world wear test, humid climates", evidence_type: "Field Study", description: "16-hour wear · n = 120 · 2025", fit_score: 68 },
  { id: "sample-irritation", title: "Dermatologist-graded irritation study", evidence_type: "Clinical Trial", description: "0 reactions reported · n = 110 · 2026", fit_score: 92 },
  { id: "sample-scent-recall", title: "Scent recall & preference survey", evidence_type: "Consumer Research", description: "74% recall at 7 days · n = 820 · 2025", fit_score: 54 },
  { id: "sample-barrier-repair", title: "Barrier repair in dry climates", evidence_type: "Clinical Trial", description: "Improved barrier scores · n = 180 · 2025", fit_score: 81 },
  { id: "sample-botanical-screen", title: "Botanical extract screening", evidence_type: "Lab Assay", description: "Antioxidant activity confirmed · n = 48 · 2024", fit_score: 63 },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const studyCategory = (study: Evidence) => {
  const type = (study.evidence_type ?? "").toLowerCase();
  if (type.includes("clinical") || type.includes("trial")) return "Clinical";
  if (type.includes("consumer") || type.includes("survey")) return "Consumer";
  if (type.includes("lab") || type.includes("assay")) return "Lab";
  return "Field";
};

const categoryCode: Record<string, string> = {
  Clinical: "CLI",
  Consumer: "CON",
  Lab: "LAB",
  Field: "FIE",
};

export default function MarketingWorkspace() {
  const [studies, setStudies] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
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
        setStudies(SAMPLE_STUDIES);
        setDemoMode(true);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("evidence")
        .select("id, title, evidence_type, description, status")
        .eq("status", "Active")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error || !data?.length) {
        setStudies(SAMPLE_STUDIES);
        setDemoMode(true);
      } else {
        setStudies(data as Evidence[]);
        setDemoMode(false);
      }
      setLoading(false);
    }
    void loadStudies();
    return () => { active = false; };
  }, []);

  const visibleStudies = useMemo(() => studies.filter((study) => {
    const matchesText = `${study.title} ${study.evidence_type ?? ""} ${study.description ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = studyFilter === "All studies" || studyCategory(study) === studyFilter;
    return matchesText && matchesType;
  }), [studies, search, studyFilter]);

  const evidenceTypes = useMemo(() => ["All studies", ...Array.from(new Set(studies.map(studyCategory)))], [studies]);
  const selectedStudy = studies.find((study) => study.id === evidenceId);
  const typeCount = new Set(studies.map(studyCategory)).size;
  const evidenceFit = selectedStudy?.fit_score ?? 68;

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claim.trim()) {
      toast.error("Add the campaign copy you want to submit.");
      return;
    }
    if (!supabase || demoMode) {
      toast.success("Demo draft ready", { description: "Connect Supabase to save this claim to your workspace." });
      setClaim("");
      setEmail("");
      setTier("T2");
      setEvidenceId("");
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
    <div className="fd-workspace">
      <aside className="fd-sidebar">
        <div className="fd-brand">
          <div className="fd-brand-mark">c</div>
          <div className="fd-brand-copy"><strong>Claims Portal</strong><span>Fieldnotes</span></div>
        </div>
        <div className="fd-sidebar-label">Workspace</div>
        <nav className="fd-nav" aria-label="Workspace navigation">
          <button className="fd-nav-item is-active" type="button" aria-current="page">
            <BookOpen aria-hidden="true" /><span>Marketing desk</span><span className="fd-nav-count">{loading ? "—" : studies.length}</span>
          </button>
          <button className="fd-nav-item" type="button" disabled><PencilLine aria-hidden="true" /><span>My drafts</span></button>
          <button className="fd-nav-item" type="button" disabled><CheckCircle2 aria-hidden="true" /><span>Approved claims</span></button>
        </nav>
        <aside className="fd-tip"><span>Tip</span><p>Tier 3 claims need a clinical or lab study with a sample above 100.</p></aside>
      </aside>

      <main className="fd-main">
        <div className="fd-topline">
          <div className="fd-breadcrumb"><span>Campaign workspace</span><b>/</b><strong>01</strong></div>
          <div className="fd-user-area"><div className="fd-team"><i />Marketing team <b>·</b> Fieldnotes</div><div className="fd-avatar">AR</div></div>
        </div>

        <header className="fd-hero">
          <h1 className="fd-hero-title">Good claims start<br />with <em>good evidence.</em></h1>
          <div className="fd-hero-aside">
            <p>Find the research. Shape the story. Send your draft forward, with the proof already attached.</p>
            <div className="fd-steps" aria-label="Claim drafting steps"><span><b>1</b>Find a study</span><span><b>2</b>Write the claim</span><span><b>3</b>Send for review</span></div>
          </div>
        </header>

        <section className="fd-stats" aria-label="Workspace overview">
          <div className="fd-stat">
            <div className="fd-metric-label">Available studies <BookOpen aria-hidden="true" /></div>
            <div className="fd-metric-line"><span className="fd-metric-value">{loading ? "—" : studies.length.toString().padStart(2, "0")}</span><span>active</span></div>
            <div className="fd-metric-track"><i style={{ width: studies.length ? "72%" : "0%" }} /></div>
            <p className="fd-metric-caption">Active research, ready to support your copy</p>
          </div>
          <div className="fd-stat">
            <div className="fd-metric-label">Evidence types <Layers3 aria-hidden="true" /></div>
            <div className="fd-metric-line"><span className="fd-metric-value">{loading ? "—" : typeCount.toString().padStart(2, "0")}</span><span>categories</span></div>
            <div className="fd-metric-track"><i style={{ width: typeCount ? `${Math.min(typeCount / 4, 1) * 100}%` : "0%" }} /></div>
            <p className="fd-metric-caption">{evidenceTypes.slice(1).join(" · ") || "Study types appear here"}</p>
          </div>
          <div className="fd-stat fd-stat-featured">
            <div className="fd-metric-label">Drafting status <Activity aria-hidden="true" /></div>
            <div className="fd-featured-line">In motion</div>
            <div className="fd-activity-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            <p className="fd-metric-caption">Ready when you are</p>
          </div>
        </section>

        <div className="fd-content-grid">
          <section className="fd-panel fd-library" aria-labelledby="library-heading">
            <div className="fd-section-head"><div><h2 id="library-heading">Research library</h2><p>Active studies available to support your copy.</p></div><span className="fd-results">{visibleStudies.length} {demoMode ? "sample " : ""}results</span></div>
            <label className="fd-search"><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search studies, outcomes, authors..." aria-label="Search studies, outcomes, or authors" /></label>
            <div className="fd-filters" role="group" aria-label="Filter studies by category">
              {evidenceTypes.map((type) => <button className={studyFilter === type ? "selected" : ""} type="button" key={type} onClick={() => setStudyFilter(type)} aria-pressed={studyFilter === type}>{type}</button>)}
            </div>
            <div className="fd-study-list">
              {loading && <div className="fd-message">Loading the research library...</div>}
              {!loading && visibleStudies.length === 0 && <div className="fd-message">No active studies match this search.</div>}
              {!loading && visibleStudies.map((study) => {
                const category = studyCategory(study);
                const isSelected = evidenceId === study.id;
                return <button className={`fd-study-row${isSelected ? " is-selected" : ""}`} data-category={category} key={study.id} type="button" aria-pressed={isSelected} onClick={() => setEvidenceId(isSelected ? "" : study.id)}>
                  <span className="fd-study-code">{categoryCode[category]}</span>
                  <span className="fd-study-info"><strong>{study.title}</strong><small>{study.description || study.evidence_type || "Active study"}</small></span>
                  <span className="fd-study-strength" aria-label={`${study.fit_score ?? 68}% evidence strength`}>{[0, 1, 2, 3, 4].map((bar) => <i key={bar} className={bar < Math.round((study.fit_score ?? 68) / 20) ? "filled" : ""} />)}</span>
                </button>;
              })}
            </div>
          </section>

          <section className="fd-panel fd-draft" aria-labelledby="draft-heading">
            <div className="fd-section-head"><div><h2 id="draft-heading">Start a claim draft</h2><p>Connect your campaign copy to its supporting study.</p></div></div>
            <form className="fd-form" onSubmit={submitClaim}>
              <label className="fd-field fd-claim-field">
                <span className="fd-field-head"><span className="fd-field-label">Proposed claim</span><span className="fd-field-meta">{claim.length} / 180</span></span>
                <textarea value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Write the exact copy you want to use..." maxLength={180} required />
              </label>
              <fieldset className="fd-field fd-tier-field">
                <legend className="fd-field-label">Target tier</legend>
                <div className="fd-tier-options" role="radiogroup" aria-label="Target claim tier">
                  {[["T1", "Indicative"], ["T2", "Substantiated"], ["T3", "Clinical"]].map(([value, label]) => <label className={tier === value ? "is-selected" : ""} key={value}>
                    <input type="radio" name="tier" value={value} checked={tier === value} onChange={() => setTier(value)} />
                    <span className="fd-tier-code">{value}</span><span>{label}</span>
                  </label>)}
                </div>
              </fieldset>
              <label className="fd-field">
                <span className="fd-field-label">Supporting study</span>
                <span className="fd-select-wrap"><Link2 aria-hidden="true" /><select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Pick a study from the library to link it.</option>{studies.map((study) => <option key={study.id} value={study.id}>{study.title}</option>)}</select><ChevronDown aria-hidden="true" /></span>
              </label>
              <div className="fd-evidence-fit" aria-live="polite">
                <div><span>Evidence fit</span><span className="fd-fit-track"><i className={selectedStudy ? "has-study" : ""} /></span><strong>{selectedStudy ? "Linked" : "—"}</strong></div>
                {selectedStudy && <p>{selectedStudy.title}</p>}
                <span className="fd-fit-score">{selectedStudy ? evidenceFit : "—"}</span>
              </div>
              <label className="fd-field fd-email-field">
                <span className="fd-field-head"><span className="fd-field-label">Work email</span><span className="fd-field-meta">Optional</span></span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
              </label>
              <button className="fd-submit" type="submit" disabled={submitting}><span>{submitting ? "Sending draft..." : "Send draft for review"}</span><Send aria-hidden="true" /></button>
              <p className="fd-form-foot">Your draft is saved with the study you selected.</p>
            </form>
          </section>
        </div>
        <footer className="fd-footer"><span>Claims Portal · Fieldnotes</span><span>Research informed · Copy ready</span></footer>
      </main>
    </div>
  );
}