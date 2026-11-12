"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCheck2,
  Layers3,
  Link2,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import GlassEvidenceFolder from "./components/glass-evidence-folder";

type Evidence = {
  id: string;
  title: string;
  evidence_type?: string | null;
  description?: string | null;
  status?: string | null;
  fit_score?: number;
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ClaimStatus = "pending" | "processing" | "completed" | "failed";

type ClaimThread = {
  id: string;
  topic_title: string | null;
  proposed_claim: string;
  target_tier: string | null;
  supporting_study: string | null;
  work_email: string | null;
  status: ClaimStatus;
  ai_evaluation: string | null;
  created_at: string;
};

type ClaimChatMessage = {
  id: string;
  submission_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

const CLAIM_THREAD_COLUMNS = "id, topic_title, proposed_claim, target_tier, supporting_study, work_email, status, ai_evaluation, created_at";
const CLAIM_CATEGORIES = ["Clinical Claims", "Substantiated Claims", "Indicative Claims", "Field Claims"] as const;
const RECENT_THREAD_STORAGE_KEY = "claims-portal:recent-chats";
const MAX_RECENT_THREADS = 10;
const INITIAL_CHAT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Hi, I’m Ivy. Share a product benefit or draft claim, and I’ll help workshop the wording and flag regulatory considerations.",
};

function claimCategory(tier: string | null): typeof CLAIM_CATEGORIES[number] {
  if (tier === "T3") return "Clinical Claims";
  if (tier === "T2") return "Substantiated Claims";
  if (tier === "T1") return "Indicative Claims";
  return "Field Claims";
}

function claimTopicTitle(claim: string): string {
  const words = claim.trim().split(/\s+/).slice(0, 4);
  const title = words.join(" ").replace(/[.,;:!?]+$/, "");
  return title.length > 36 ? `${title.slice(0, 33).trimEnd()}...` : title;
}

function reportField(report: string, labels: string[]): string {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = report.match(new RegExp(`^\\s*(?:[-*]\\s*)?(?:#{1,6}\\s*)?(?:\\*\\*)?(?:${escapedLabels})(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*(.+)$`, "im"));
  return match?.[1]?.replace(/\*\*/g, "").trim() || "Not specified in audit report";
}

function reportUrls(report: string): string[] {
  const urls = Array.from(report.matchAll(/https?:\/\/[^\s)<>"']+/g), ([url]) => url.replace(/[.,;]+$/, ""));
  return Array.from(new Set(urls));
}

function parseClaimThread(value: unknown): ClaimThread | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.proposed_claim !== "string"
    || typeof value.created_at !== "string"
    || (value.status !== "pending" && value.status !== "processing" && value.status !== "completed" && value.status !== "failed")) {
    return null;
  }
  return {
    id: value.id,
    topic_title: typeof value.topic_title === "string" ? value.topic_title : null,
    proposed_claim: value.proposed_claim,
    target_tier: typeof value.target_tier === "string" ? value.target_tier : null,
    supporting_study: typeof value.supporting_study === "string" ? value.supporting_study : null,
    work_email: typeof value.work_email === "string" ? value.work_email : null,
    status: value.status,
    ai_evaluation: typeof value.ai_evaluation === "string" ? value.ai_evaluation : null,
    created_at: value.created_at,
  };
}

function parseClaimChatMessage(value: unknown): ClaimChatMessage | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.submission_id !== "string"
    || typeof value.content !== "string"
    || typeof value.created_at !== "string"
    || (value.role !== "user" && value.role !== "assistant" && value.role !== "system")) {
    return null;
  }
  return {
    id: value.id,
    submission_id: value.submission_id,
    role: value.role,
    content: value.content,
    created_at: value.created_at,
  };
}

function upsertClaimThread(threads: ClaimThread[], thread: ClaimThread): ClaimThread[] {
  return [thread, ...threads.filter((item) => item.id !== thread.id)]
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export default function MarketingWorkspace() {
  const [studies, setStudies] = useState<Evidence[]>([]);
  const [search, setSearch] = useState("");
  const [claimFilter, setClaimFilter] = useState("All claims");
  const [openFolder, setOpenFolder] = useState("");
  const [claim, setClaim] = useState("");
  const [email, setEmail] = useState("");
  const [supportingStudy, setSupportingStudy] = useState("");
  const [tier, setTier] = useState("T2");
  const [evidenceId, setEvidenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [claimThreads, setClaimThreads] = useState<ClaimThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [recentThreadIds, setRecentThreadIds] = useState<string[]>([]);
  const [recentThreadsInitialized, setRecentThreadsInitialized] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("main");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [unreadThreadIds, setUnreadThreadIds] = useState<Set<string>>(new Set());
  const [threadMessages, setThreadMessages] = useState<ClaimChatMessage[]>([]);
  const [threadInput, setThreadInput] = useState("");
  const [threadSending, setThreadSending] = useState(false);
  const claimThreadsRef = useRef<ClaimThread[]>([]);
  const activeThreadIdRef = useRef("main");
  const unreadThreadIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (threadsLoading || recentThreadsInitialized) return;

    try {
      const saved = window.localStorage.getItem(RECENT_THREAD_STORAGE_KEY);
      if (saved === null) {
        setRecentThreadIds(claimThreads.slice(0, MAX_RECENT_THREADS).map((thread) => thread.id));
      } else {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
          throw new Error("Recent chat history has an invalid format.");
        }
        const availableIds = new Set(claimThreads.map((thread) => thread.id));
        setRecentThreadIds(parsed.filter((id: string) => availableIds.has(id)).slice(0, MAX_RECENT_THREADS));
      }
    } catch (error) {
      toast.error("Could not load recent chats", {
        description: error instanceof Error ? error.message : "Recent chat history is unavailable.",
      });
      setRecentThreadIds(claimThreads.slice(0, MAX_RECENT_THREADS).map((thread) => thread.id));
    }
    setRecentThreadsInitialized(true);
  }, [claimThreads, recentThreadsInitialized, threadsLoading]);

  useEffect(() => {
    if (!recentThreadsInitialized) return;
    try {
      window.localStorage.setItem(RECENT_THREAD_STORAGE_KEY, JSON.stringify(recentThreadIds));
    } catch (error) {
      toast.error("Could not save recent chats", {
        description: error instanceof Error ? error.message : "Recent chat history is unavailable.",
      });
    }
  }, [recentThreadIds, recentThreadsInitialized]);

  useEffect(() => {
    let active = true;
    async function loadStudies() {
      if (!supabase) {
        setStudies(SAMPLE_STUDIES);
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
      } else {
        setStudies(data as Evidence[]);
      }
    }
    void loadStudies();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setThreadsLoading(false);
      return;
    }

    const client = supabase;
    let active = true;
    const channel = client
      .channel("claim-submissions-lifecycle")
      .on("postgres_changes", { event: "*", schema: "public", table: "claim_submissions" }, (payload) => {
        if (!active) return;
        if (payload.eventType === "DELETE") return;
        const thread = parseClaimThread(payload.new);
        if (!thread) return;

        const previous = claimThreadsRef.current.find((item) => item.id === thread.id);
        const nextThreads = upsertClaimThread(claimThreadsRef.current, thread);
        claimThreadsRef.current = nextThreads;
        setClaimThreads(nextThreads);
        if (!previous) {
          setRecentThreadIds((current) => [thread.id, ...current.filter((id) => id !== thread.id)].slice(0, MAX_RECENT_THREADS));
        }

        if (payload.eventType === "UPDATE" && thread.status === "completed" && previous?.status !== "completed") {
          if (activeThreadIdRef.current !== thread.id && !unreadThreadIdsRef.current.has(thread.id)) {
            const nextUnread = new Set(unreadThreadIdsRef.current);
            nextUnread.add(thread.id);
            unreadThreadIdsRef.current = nextUnread;
            setUnreadThreadIds(nextUnread);
          }
          toast.success(`Analysis complete: ${thread.topic_title || "Claim audit"}`);
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          toast.error("Live claim updates are unavailable", { description: "Refresh to check for audit updates." });
        }
      });

    async function loadClaimThreads() {
      const { data, error } = await client
        .from("claim_submissions")
        .select(CLAIM_THREAD_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) {
        setThreadsLoading(false);
        toast.error("Could not load claim audits", { description: error.message });
        return;
      }

      const loaded = (data ?? []).map(parseClaimThread).filter((thread): thread is ClaimThread => thread !== null);
      const merged = new Map(loaded.map((thread) => [thread.id, thread]));
      claimThreadsRef.current.forEach((thread) => merged.set(thread.id, thread));
      const nextThreads = Array.from(merged.values()).sort((left, right) => right.created_at.localeCompare(left.created_at));
      claimThreadsRef.current = nextThreads;
      setClaimThreads(nextThreads);
      setThreadsLoading(false);
    }
    void loadClaimThreads();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!supabase || activeThreadId === "main") {
      setThreadMessages([]);
      return;
    }

    const client = supabase;
    let active = true;
    const threadId = activeThreadId;
    const channel = client
      .channel(`claim-chat-${threadId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "claim_chat_messages",
        filter: `submission_id=eq.${threadId}`,
      }, (payload) => {
        if (!active) return;
        const message = parseClaimChatMessage(payload.new);
        if (!message) return;
        setThreadMessages((previous) => previous.some((item) => item.id === message.id)
          ? previous
          : [...previous, message].sort((left, right) => left.created_at.localeCompare(right.created_at)));
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          toast.error("Live claim discussion updates are unavailable");
        }
      });

    async function loadThreadMessages() {
      const { data, error } = await client
        .from("claim_chat_messages")
        .select("id, submission_id, role, content, created_at")
        .eq("submission_id", threadId)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        toast.error("Could not load claim discussion", { description: error.message });
        return;
      }
      const loaded = (data ?? []).map(parseClaimChatMessage).filter((message): message is ClaimChatMessage => message !== null);
      setThreadMessages((current) => {
        const merged = new Map(loaded.map((message) => [message.id, message]));
        current.forEach((message) => {
          if (message.submission_id === threadId) merged.set(message.id, message);
        });
        return Array.from(merged.values()).sort((left, right) => left.created_at.localeCompare(right.created_at));
      });
    }
    void loadThreadMessages();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [activeThreadId]);

  const visibleClaims = useMemo(() => claimThreads.filter((thread) => {
    const matchesText = `${thread.topic_title ?? ""} ${thread.proposed_claim} ${thread.supporting_study ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = claimFilter === "All claims" || claimCategory(thread.target_tier) === claimFilter;
    return matchesText && matchesCategory;
  }), [claimThreads, search, claimFilter]);

  const groupedClaims = useMemo(() => CLAIM_CATEGORIES.map((category) => [
    category,
    visibleClaims.filter((thread) => claimCategory(thread.target_tier) === category),
  ] as const), [visibleClaims]);
  const claimFilterOptions = ["All claims", ...CLAIM_CATEGORIES];
  const recentThreads = recentThreadIds
    .map((id) => claimThreads.find((thread) => thread.id === id))
    .filter((thread): thread is ClaimThread => thread !== undefined);
  const selectedClaim = claimThreads.find((thread) => thread.id === selectedClaimId);
  const selectedStudy = studies.find((study) => study.id === evidenceId);
  const claimCategoryCount = new Set(claimThreads.map((thread) => claimCategory(thread.target_tier))).size;
  const pendingClaimCount = claimThreads.filter((thread) => thread.status === "pending" || thread.status === "processing").length;
  const evidenceFit = selectedStudy?.fit_score ?? 68;

  function selectThread(threadId: string) {
    const changed = activeThreadIdRef.current !== threadId;
    activeThreadIdRef.current = threadId;
    setActiveThreadId(threadId);
    setSelectedClaimId(threadId === "main" ? "" : threadId);
    if (threadId !== "main") {
      setRecentThreadIds((current) => [threadId, ...current.filter((id) => id !== threadId)].slice(0, MAX_RECENT_THREADS));
    }
    if (changed) {
      setThreadMessages([]);
      setThreadInput("");
    }
    if (threadId !== "main" && unreadThreadIdsRef.current.has(threadId)) {
      const nextUnread = new Set(unreadThreadIdsRef.current);
      nextUnread.delete(threadId);
      unreadThreadIdsRef.current = nextUnread;
      setUnreadThreadIds(nextUnread);
    }
  }

  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content || chatLoading) return;

    const userMessage: ChatMessage = { role: "user", content };
    const conversation = [...chatMessages.slice(-19), userMessage];
    setChatMessages(conversation);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The chat service returned an unreadable response.");
      }

      if (!isRecord(payload)) {
        throw new Error("The chat service returned an invalid response.");
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "The chat request failed.");
      }
      if (typeof payload.reply !== "string") {
        throw new Error("The chat service did not return a reply.");
      }

      const reply = payload.reply.trim();
      const auditReady = reply.match(/\[AUDIT_READY:\s*([^\]]+)\]\s*$/);
      const assistantContent = auditReady ? reply.slice(0, auditReady.index).trim() : reply;
      if (auditReady) {
        setClaim(auditReady[1].trim());
      }
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantContent || "This claim is ready to prepare for review.",
      };
      setChatMessages([...conversation, assistantMessage].slice(-20));
    } catch (error) {
      setChatMessages(chatMessages);
      setChatInput(content);
      toast.error("Could not get a chat reply", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setChatLoading(false);
    }
  }

  async function dispatchAudit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claim.trim()) {
      toast.error("Add the campaign copy you want to submit.");
      return;
    }
    if (claim.trim().length > 180) {
      toast.error("Shorten the proposed claim to 180 characters or fewer.");
      return;
    }
    if (!supabase) {
      toast.error("Connect Supabase before dispatching an audit.");
      return;
    }
    setSubmitting(true);
    const supportingStudyDetails = supportingStudy.trim() || (selectedStudy
      ? [selectedStudy.title, selectedStudy.description].filter(Boolean).join(" — ")
      : "");
    try {
      const { data, error } = await supabase
        .from("claim_submissions")
        .insert({
          proposed_claim: claim.trim(),
          topic_title: claimTopicTitle(claim),
          target_tier: tier,
          supporting_study: supportingStudyDetails || null,
          work_email: email.trim() || null,
          status: "pending",
        })
        .select(CLAIM_THREAD_COLUMNS)
        .single();
      if (error) {
        toast.error("The audit could not be dispatched", { description: error.message });
        return;
      }
      const newThread = parseClaimThread(data);
      if (!newThread) {
        toast.error("The audit was created, but its details could not be read. Refresh the workspace.");
        return;
      }
      const nextThreads = upsertClaimThread(claimThreadsRef.current, newThread);
      claimThreadsRef.current = nextThreads;
      setClaimThreads(nextThreads);
      setRecentThreadIds((current) => [newThread.id, ...current.filter((id) => id !== newThread.id)].slice(0, MAX_RECENT_THREADS));
      toast.success("Deep audit dispatched", {
        description: `${newThread.topic_title} is running in the background. You can keep brainstorming.`,
      });
      setClaim("");
      setEmail("");
      setSupportingStudy("");
      setTier("T2");
      setEvidenceId("");
    } catch (error) {
      toast.error("The audit could not be dispatched", {
        description: error instanceof Error ? error.message : "Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function sendThreadMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submissionId = activeThreadIdRef.current;
    const content = threadInput.trim();
    if (!content || !supabase || submissionId === "main" || threadSending) return;

    setThreadInput("");
    setThreadSending(true);
    const { data, error } = await supabase
      .from("claim_chat_messages")
      .insert({ submission_id: submissionId, role: "user", content })
      .select("id, submission_id, role, content, created_at")
      .single();
    if (error) {
      setThreadInput(content);
      setThreadSending(false);
      toast.error("Your discussion message could not be saved", { description: error.message });
      return;
    }

    const savedUserMessage = parseClaimChatMessage(data);
    if (savedUserMessage && activeThreadIdRef.current === submissionId) {
      setThreadMessages((previous) => previous.some((item) => item.id === savedUserMessage.id)
        ? previous
        : [...previous, savedUserMessage].sort((left, right) => left.created_at.localeCompare(right.created_at)));
    }

    try {
      const thread = claimThreadsRef.current.find((item) => item.id === submissionId);
      const context = thread
        ? `Audited claim: ${thread.proposed_claim}\nAudit findings: ${(thread.ai_evaluation || "The audit is still processing.").slice(0, 4000)}`
        : "The audit details are not currently available.";
      const previousMessages: ChatMessage[] = threadMessages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-4)
        .map(({ role, content: messageContent }) => ({ role, content: messageContent.slice(-1000) }));
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...previousMessages,
            { role: "user", content: `${context}\n\nFollow-up: ${content}` },
          ],
        }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The chat service returned an unreadable response.");
      }
      if (!isRecord(payload) || typeof payload.reply !== "string") {
        throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "The chat service did not return a reply.");
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "The chat request failed.");
      }

      const assistantContent = payload.reply.replace(/\s*\[AUDIT_READY:\s*[^\]]+\]\s*$/, "").trim();
      if (!assistantContent) return;
      const { data: assistantData, error: assistantError } = await supabase
        .from("claim_chat_messages")
        .insert({ submission_id: submissionId, role: "assistant", content: assistantContent })
        .select("id, submission_id, role, content, created_at")
        .single();
      if (assistantError) {
        toast.error("The reply was generated but could not be saved", { description: assistantError.message });
        return;
      }
      const savedAssistantMessage = parseClaimChatMessage(assistantData);
      if (savedAssistantMessage && activeThreadIdRef.current === submissionId) {
        setThreadMessages((previous) => previous.some((item) => item.id === savedAssistantMessage.id)
          ? previous
          : [...previous, savedAssistantMessage].sort((left, right) => left.created_at.localeCompare(right.created_at)));
      }
    } catch (error) {
      toast.error("Could not generate a claim discussion reply", {
        description: error instanceof Error ? error.message : "The user message was saved; try again for a reply.",
      });
    } finally {
      setThreadSending(false);
    }
  }

  return (
    <div className="fd-workspace">
      <aside className="fd-sidebar">
        <div className="fd-brand">
          <div className="fd-brand-mark">c</div>
          <div className="fd-brand-copy"><strong>Claims Portal</strong><span>Ivy Evergreen</span></div>
        </div>
        <div className="fd-sidebar-label">Workspace</div>
        <nav className="fd-nav" aria-label="Workspace navigation">
          <button className={`fd-nav-item${activeThreadId === "main" ? " is-active" : ""}`} type="button" onClick={() => selectThread("main")} aria-current={activeThreadId === "main" ? "page" : undefined}>
            <Sparkles aria-hidden="true" /><span>Ivy</span><span className="fd-nav-count">Live</span>
          </button>
        </nav>
        <section className="fd-thread-section" aria-label="Deep audit threads">
          <div className="fd-thread-heading">
            <span>Recent claims</span>
            <div className="fd-thread-heading-actions">
              <span>{threadsLoading ? "—" : `${recentThreads.length}/${MAX_RECENT_THREADS}`}</span>
            </div>
          </div>
          <div className="fd-thread-list">
            {threadsLoading && <p className="fd-thread-empty">Loading audit threads…</p>}
            {!threadsLoading && recentThreads.length === 0 && <p className="fd-thread-empty">No recent claims. Reopen one from the claim folders.</p>}
            {recentThreads.map((thread) => {
              const isSelected = activeThreadId === thread.id;
              const hasUnread = unreadThreadIds.has(thread.id);
              const isProcessing = thread.status === "pending" || thread.status === "processing";
              const title = thread.topic_title || "Claim audit";
              return <div key={thread.id} className="fd-thread-entry">
                <button className={`fd-thread-item${isSelected ? " is-active" : ""}`} type="button" onClick={() => selectThread(thread.id)} aria-current={isSelected ? "page" : undefined}>
                  {isProcessing ? <Clock className="is-spinning" aria-label="Audit in progress" /> : thread.status === "failed" ? <AlertCircle aria-label="Audit failed" /> : <FileCheck2 aria-label="Audit complete" />}
                  <span className="fd-thread-copy"><strong>{title}</strong><small>{thread.status}</small></span>
                  {hasUnread && <span className="fd-unread-badge" aria-label="New audit result">1</span>}
                </button>
                <button className="fd-thread-remove" type="button" onClick={() => setRecentThreadIds((current) => current.filter((id) => id !== thread.id))} aria-label={`Remove ${title} from recent claims`} title="Remove from recent claims">
                  <X aria-hidden="true" />
                </button>
              </div>;
            })}
          </div>
        </section>
        <aside className="fd-tip"><span>Review note</span><p>AI audit results are a starting point. Have every claim reviewed by your team.</p></aside>
      </aside>

      <main className="fd-main">
        <div className="fd-topline">
          <div className="fd-breadcrumb"><span>Campaign workspace</span><b>/</b><strong>01</strong></div>
          <div className="fd-user-area"><div className="fd-team"><i />Marketing team <b>·</b> Ivy Evergreen</div><div className="fd-avatar">AR</div></div>
        </div>

        <header className="fd-hero">
          <h1 className="fd-hero-title">Good claims start<br />with <em>good evidence.</em></h1>
          <div className="fd-hero-aside">
            <p>Shape the claim. Find the research. Send your draft forward, with the proof already attached.</p>
            <div className="fd-steps" aria-label="Claim drafting steps"><span><b>1</b>Write the claim</span><span><b>2</b>Find a study</span><span><b>3</b>Send for review</span></div>
          </div>
        </header>

        <section className="fd-stats" aria-label="Workspace overview">
          <div className="fd-stat">
            <div className="fd-metric-label">Claim audits <FileCheck2 aria-hidden="true" /></div>
            <div className="fd-metric-line"><span className="fd-metric-value">{threadsLoading ? "—" : claimThreads.length.toString().padStart(2, "0")}</span><span>submitted</span></div>
            <div className="fd-metric-track"><i style={{ width: claimThreads.length ? `${Math.min(claimThreads.length / 10, 1) * 100}%` : "0%" }} /></div>
            <p className="fd-metric-caption">Audits and dossiers in this workspace</p>
          </div>
          <div className="fd-stat">
            <div className="fd-metric-label">Claim tiers <Layers3 aria-hidden="true" /></div>
            <div className="fd-metric-line"><span className="fd-metric-value">{threadsLoading ? "—" : claimCategoryCount.toString().padStart(2, "0")}</span><span>categories</span></div>
            <div className="fd-metric-track"><i style={{ width: claimCategoryCount ? `${Math.min(claimCategoryCount / 4, 1) * 100}%` : "0%" }} /></div>
            <p className="fd-metric-caption">Clinical · Substantiated · Indicative · Field</p>
          </div>
          <div className="fd-stat fd-stat-featured">
            <div className="fd-metric-label">Background reviews <Activity aria-hidden="true" /></div>
            <div className="fd-featured-line">{pendingClaimCount ? `${pendingClaimCount} running` : "In motion"}</div>
            <div className="fd-activity-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            <p className="fd-metric-caption">Keep brainstorming while audits run</p>
          </div>
        </section>

        <div className="fd-content-grid">
          <section className="fd-panel fd-library" aria-labelledby="library-heading">
            <div className="fd-section-head"><div><h2 id="library-heading">Claim catalog</h2><p>Audits grouped by target tier, with live status updates.</p></div><span className="fd-results">{visibleClaims.length} {visibleClaims.length === 1 ? "claim" : "claims"}</span></div>
            <label className="fd-search"><Search aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search claims, studies, and reports..." aria-label="Search claims, supporting studies, and reports" /></label>
            <div className="fd-filters" role="group" aria-label="Filter claims by tier">
              {claimFilterOptions.map((category) => <button className={claimFilter === category ? "selected" : ""} type="button" key={category} onClick={() => setClaimFilter(category)} aria-pressed={claimFilter === category}>{category}</button>)}
            </div>
            <div className="fd-folder-grid">
              {threadsLoading && <div className="fd-message">Loading claim audits…</div>}
              {!threadsLoading && claimThreads.length === 0 && <div className="fd-message">Your dispatched claim audits will appear here.</div>}
              {!threadsLoading && claimThreads.length > 0 && visibleClaims.length === 0 && <div className="fd-message">No claim audits match this search.</div>}
              {!threadsLoading && visibleClaims.length > 0 && groupedClaims.map(([category, categoryClaims]) => {
                const isOpen = openFolder === category;
                const files = categoryClaims.map((thread) => ({
                  id: thread.id,
                  title: thread.topic_title || thread.proposed_claim,
                  meta: `${thread.status} · ${thread.target_tier || "No tier"}`,
                  fitScore: thread.status === "completed" ? 1 : 0,
                }));
                return <div className="fd-folder-cell" data-open={isOpen || undefined} key={category}>
                <GlassEvidenceFolder
                  category={category}
                  itemLabel="claim"
                  files={files}
                  selectedId={selectedClaimId}
                  onSelect={(id) => selectThread(id)}
                  open={isOpen}
                  onOpenChange={(next) => setOpenFolder(next ? category : "")}
                />
              </div>;
              })}
            </div>
            {selectedClaim && <section className="fd-dossier" aria-labelledby="dossier-heading">
              <div className="fd-dossier-header">
                <div><span className="fd-field-label">Claim dossier</span><h3 id="dossier-heading">{selectedClaim.topic_title || "Audited claim"}</h3></div>
                <span className={`fd-status-pill is-${selectedClaim.status}`}>{selectedClaim.status === "pending" || selectedClaim.status === "processing" ? <Clock aria-hidden="true" /> : selectedClaim.status === "failed" ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{selectedClaim.status}</span>
              </div>
              <dl className="fd-dossier-properties">
                <div><dt>Category</dt><dd>{claimCategory(selectedClaim.target_tier)}{selectedClaim.target_tier ? ` · ${selectedClaim.target_tier}` : ""}</dd></div>
                <div><dt>Audited claim copy</dt><dd className="fd-dossier-claim">{selectedClaim.proposed_claim}</dd></div>
                <div><dt>Supporting studies & URLs</dt><dd>
                  {selectedClaim.supporting_study || "No supporting study was linked directly."}
                  {reportUrls(`${selectedClaim.supporting_study ?? ""}\n${selectedClaim.ai_evaluation ?? ""}`).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}
                </dd></div>
                <div><dt>Study design</dt><dd>{reportField(selectedClaim.ai_evaluation ?? "", ["Study design"])}</dd></div>
                <div><dt>Sample size (n)</dt><dd>{reportField(selectedClaim.ai_evaluation ?? "", ["Sample size", "Sample size (n)"])}</dd></div>
                <div><dt>Documented clinical outcomes</dt><dd>{reportField(selectedClaim.ai_evaluation ?? "", ["Documented clinical outcomes", "Clinical outcomes"])}</dd></div>
                <div><dt>Regulatory risk</dt><dd>{reportField(selectedClaim.ai_evaluation ?? "", ["Regulatory risk", "Risk level"])}</dd></div>
                <div><dt>Confidence level</dt><dd>{reportField(selectedClaim.ai_evaluation ?? "", ["Confidence level", "Confidence"])}</dd></div>
              </dl>
              <div className="fd-dossier-report">
                <h4><ShieldAlert aria-hidden="true" /> Regulatory assessment</h4>
                {selectedClaim.ai_evaluation
                  ? <p>{selectedClaim.ai_evaluation}</p>
                  : <p className="is-pending">{selectedClaim.status === "failed" ? "The background audit failed. Check the worker logs before retrying." : "The background worker is researching this claim. Findings will appear here when the audit completes."}</p>}
              </div>
              <div className="fd-dossier-chat">
                <div className="fd-dossier-chat-heading"><h4><MessageSquare aria-hidden="true" /> Follow-up discussion</h4><span>{threadMessages.length} messages</span></div>
                <div className="fd-dossier-chat-log" role="log" aria-live="polite" aria-label="Claim audit discussion">
                  {threadMessages.length === 0 && <p className="fd-thread-empty">Ask the Claims Researcher to clarify a finding or suggest a revision.</p>}
                  {threadMessages.map((message) => <div key={message.id} className={`fd-dossier-message${message.role === "user" ? " is-user" : ""}`}><span>{message.role === "user" ? "You" : "Claims Researcher"}</span><p>{message.content}</p></div>)}
                  {threadSending && <p className="fd-thread-empty" role="status">Preparing a reply…</p>}
                </div>
                <form className="fd-thread-compose" onSubmit={sendThreadMessage}>
                  <label className="fd-sr-only" htmlFor="claim-thread-input">Message Claims Researcher</label>
                  <textarea id="claim-thread-input" value={threadInput} onChange={(event) => setThreadInput(event.target.value)} maxLength={3000} placeholder="Ask a question about this audit…" required />
                  <button type="submit" disabled={threadSending || !threadInput.trim() || !supabase} aria-label="Send discussion message"><Send aria-hidden="true" /></button>
                </form>
              </div>
            </section>}
          </section>

          <section className="fd-panel fd-draft" aria-labelledby="draft-heading">
            <div className="fd-section-head"><div><h2 id="draft-heading">Workshop a claim</h2><p>Talk through your idea, then prepare a claim for review.</p></div></div>
            <div className="fd-chat">
              <div className="fd-chat-log" role="log" aria-live="polite" aria-label="Claim workshop conversation">
                {chatMessages.map((message, index) => <div className={`fd-chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`} key={`${index}-${message.role}`}>
                  {message.role === "assistant" && <Sparkles aria-hidden="true" />}
                  <p>{message.content}</p>
                </div>)}
                {chatLoading && <div className="fd-chat-message is-assistant" role="status"><Sparkles aria-hidden="true" /><p>Thinking through the claim…</p></div>}
              </div>
              <form className="fd-chat-compose" onSubmit={sendChatMessage}>
                <label className="fd-sr-only" htmlFor="claim-chat-input">Message Ivy</label>
                <textarea id="claim-chat-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Describe the product benefit or claim you want to explore..." maxLength={3000} required />
                <button type="submit" aria-label="Send message" disabled={chatLoading || !chatInput.trim()}><Send aria-hidden="true" /></button>
              </form>
              <p className="fd-chat-foot">AI brainstorming is not legal advice. Claims need human review.</p>
            </div>
            {claim && <form className="fd-form fd-claim-review" onSubmit={dispatchAudit}>
              <label className="fd-field fd-claim-field">
                <span className="fd-field-head"><span className="fd-field-label">Proposed claim</span><span className="fd-field-meta">{claim.length} / 180</span></span>
                <textarea value={claim} onChange={(event) => setClaim(event.target.value)} maxLength={180} required />
              </label>
              <fieldset className="fd-field fd-tier-field">
                <legend className="fd-field-label">Target tier</legend>
                <div className="fd-tier-options" role="radiogroup" aria-label="Target claim tier">
                  {[['T1', 'Indicative'], ['T2', 'Substantiated'], ['T3', 'Clinical']].map(([value, label]) => <label className={tier === value ? "is-selected" : ""} key={value}>
                    <input type="radio" name="tier" value={value} checked={tier === value} onChange={() => setTier(value)} />
                    <span className="fd-tier-code">{value}</span><span>{label}</span>
                  </label>)}
                </div>
              </fieldset>
              <label className="fd-field">
                <span className="fd-field-label">Choose a study from your library</span>
                <span className="fd-select-wrap"><Link2 aria-hidden="true" /><select value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)}><option value="">Pick a study from the library to link it.</option>{studies.map((study) => <option key={study.id} value={study.id}>{study.title}</option>)}</select><ChevronDown aria-hidden="true" /></span>
              </label>
              <div className="fd-evidence-fit" aria-live="polite">
                <div><span>Evidence fit</span><span className="fd-fit-track"><i className={selectedStudy ? "has-study" : ""} /></span><strong>{selectedStudy ? "Linked" : "—"}</strong></div>
                {selectedStudy && <p>{selectedStudy.title}</p>}
                <span className="fd-fit-score">{selectedStudy ? evidenceFit : "—"}</span>
              </div>
              <label className="fd-field fd-supporting-field">
                <span className="fd-field-head"><span className="fd-field-label">Study details or URL</span><span className="fd-field-meta">Optional</span></span>
                <input type="text" value={supportingStudy} onChange={(event) => setSupportingStudy(event.target.value)} placeholder="Add a paper link or specific study details" />
              </label>
              <label className="fd-field fd-email-field">
                <span className="fd-field-head"><span className="fd-field-label">Work email</span><span className="fd-field-meta">Optional</span></span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
              </label>
              <button className="fd-submit" type="submit" disabled={submitting || !supabase}><span>{submitting ? "Dispatching audit..." : "Dispatch deep audit"}</span><Send aria-hidden="true" /></button>
              <p className="fd-form-foot">{supabase ? "Your audit runs in the background while you keep brainstorming." : "Connect Supabase to dispatch and track claim audits."}</p>
            </form>}
          </section>
        </div>
        <footer className="fd-footer"><span>Claims Portal · Ivy Evergreen</span><span>Research informed · Copy ready</span></footer>
      </main>
    </div>
  );
}
