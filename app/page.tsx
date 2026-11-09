"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, Search, Send } from "lucide-react";
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
    return () => {
      active = false;
    };
  }, []);

  const visibleStudies = useMemo(() => {
    return studies.filter((study) => {
      const matchesText = `${study.title} ${study.evidence_type ?? ""} ${study.description ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesType = studyFilter === "All studies" || studyCategory(study) === studyFilter;
      return matchesText && matchesType;
    });
  }, [studies, search, studyFilter]);

  const evidenceTypes = useMemo(
    () => ["All studies", ...Array.from(new Set(studies.map(studyCategory)))],
    [studies],
  );

  const selectedStudy = studies.find((study) => study.id === evidenceId);
  const evidenceFit = selectedStudy?.fit_score ?? 42;

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!claim.trim()) {
      toast.error("Add the campaign copy you want to submit.");
      return;
    }

    if (!supabase || demoMode) {
      toast.success("Demo draft ready", {
        description: "Connect Supabase to save this claim to your workspace.",
      });
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
    <div className="marketing-shell">
      <section className="panel library-panel">
        <div className="panel-header">
          <div>
            <h1>Research library</h1>
            <p>Active studies available to support your copy.</p>
          </div>
          <span className="result-count">
            {visibleStudies.length} {demoMode ? "sample" : "results"}
          </span>
        </div>

        <label className="search-field" aria-label="Search studies">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search studies, outcomes, authors..."
          />
        </label>

        <div className="filter-row" role="group" aria-label="Study category filters">
          {evidenceTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={studyFilter === type ? "selected" : ""}
              onClick={() => setStudyFilter(type)}
              aria-pressed={studyFilter === type}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="study-list">
          {loading && <div className="empty-state">Loading the research library...</div>}
          {!loading && visibleStudies.length === 0 && (
            <div className="empty-state">No active studies match this search.</div>
          )}

          {!loading &&
            visibleStudies.map((study) => {
              const category = studyCategory(study);
              const isSelected = evidenceId === study.id;
              const strengthValue = Math.max(1, Math.round((study.fit_score ?? 68) / 20));

              return (
                <button
                  key={study.id}
                  type="button"
                  className={`study-row ${isSelected ? "selected" : ""}`}
                  data-category={category}
                  onClick={() => setEvidenceId(isSelected ? "" : study.id)}
                  aria-pressed={isSelected}
                >
                  <span className="study-badge">{categoryCode[category]}</span>
                  <div className="study-copy">
                    <strong>{study.title}</strong>
                    <small>{study.description || study.evidence_type || "Active study"}</small>
                  </div>
                  <span className="strength-bars" aria-label={`${study.fit_score ?? 68}% evidence strength`}>
                    {[0, 1, 2, 3, 4].map((bar) => (
                      <i key={bar} className={bar < strengthValue ? "filled" : ""} />
                    ))}
                  </span>
                </button>
              );
            })}
        </div>
      </section>

      <section className="panel draft-panel">
        <div className="panel-header draft-header">
          <div>
            <h2>Start a claim draft</h2>
            <p>Connect your campaign copy to its supporting study.</p>
          </div>
        </div>

        <form className="draft-form" onSubmit={submitClaim}>
          <label className="field-group">
            <span className="field-head">
              <span className="field-label">Proposed claim</span>
              <span className="field-meta">{claim.length} / 180</span>
            </span>
            <textarea
              value={claim}
              onChange={(event) => setClaim(event.target.value)}
              placeholder="Write the exact copy you want to use..."
              maxLength={180}
              required
            />
          </label>

          <fieldset className="field-group tier-field">
            <legend className="field-label">Target tier</legend>
            <div className="tier-grid" role="radiogroup" aria-label="Target tier options">
              {["T1", "T2", "T3"].map((value) => {
                const label = value === "T1" ? "Indicative" : value === "T2" ? "Substantiated" : "Clinical";
                return (
                  <label key={value} className={tier === value ? "tier-option selected" : "tier-option"}>
                    <input
                      type="radio"
                      name="tier"
                      value={value}
                      checked={tier === value}
                      onChange={() => setTier(value)}
                    />
                    <span className="tier-code">{value}</span>
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="field-group">
            <span className="field-label">Supporting study</span>
            <span className="select-wrap">
              <select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}>
                <option value="">Select a supporting study</option>
                {studies.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.title}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </span>
          </label>

          <div className={`evidence-box ${selectedStudy ? "is-linked" : ""}`} aria-live="polite">
            <div className="evidence-topline">
              <span>Evidence fit</span>
              <div className="fit-meter">
                <span style={{ width: selectedStudy ? `${Math.min(100, evidenceFit)}%` : "42%" }} />
              </div>
              <strong>{selectedStudy ? "Linked" : "—"}</strong>
            </div>
            {selectedStudy ? <p>{selectedStudy.title}</p> : null}
            <span className="fit-score">{selectedStudy ? evidenceFit : "42"}</span>
          </div>

          <label className="field-group">
            <span className="field-head">
              <span className="field-label">Work email</span>
              <span className="field-meta">Optional</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </label>

          <button className="submit-button" type="submit" disabled={submitting}>
            <span>{submitting ? "Sending draft..." : "Send draft for review"}</span>
            <Send aria-hidden="true" />
          </button>

          <p className="form-foot">Your draft is saved with the study you selected.</p>
        </form>
      </section>
    </div>
  );
}
