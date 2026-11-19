"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Beaker,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Layers3,
  LoaderCircle,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import GlassEvidenceFolder from "./components/glass-evidence-folder";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  workshoppedClaim?: string;
  studySources?: StudySourceDisplay[];
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

type RdEvidenceType = "Clinical Study" | "Ingredient Research" | "Product & Lab Testing";

type RdUploadResult = {
  evidenceId: string;
  chunksStored: number;
  summary: string;
  webViewLink: string;
  driveUploadWarning?: string;
};

type RdCatalogSyncResult = {
  syncedRows: number;
  chunksSynced: number;
  graphNodesSynced: number;
  graphEdgesSynced: number;
};

const CLAIM_THREAD_COLUMNS = "id, topic_title, proposed_claim, target_tier, supporting_study, work_email, status, ai_evaluation, created_at";
const CLAIM_CATEGORIES = ["Clinical Claims", "Substantiated Claims", "Indicative Claims", "Field Claims"] as const;
const RD_EVIDENCE_TYPES: RdEvidenceType[] = ["Clinical Study", "Ingredient Research", "Product & Lab Testing"];
const RD_DEFAULT_AUTHOR_SOURCE = "R&D / Internal Research Team";
const RECENT_THREAD_STORAGE_KEY = "claims-portal:recent-chats";
const MAX_RECENT_THREADS = 10;
const INITIAL_CHAT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Hi, I’m Ivy—I’ll help workshop the wording and find supporting studies to strengthen your product benefit or draft claim.",
};

function claimCategory(tier: string | null): typeof CLAIM_CATEGORIES[number] {
  if (tier === "T3") return "Clinical Claims";
  if (tier === "T2") return "Substantiated Claims";
  if (tier === "T1") return "Indicative Claims";
  return "Field Claims";
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

function parseStudySources(supportingStudy: string | null, evaluation: string | null): StudySourceDisplay[] {
  const report = `${supportingStudy ?? ""}\n\n${evaluation ?? ""}`;
  const sources = new Map<string, StudySourceDisplay>();
  for (const block of report.split(/\n\s*\n/)) {
    const url = reportUrls(block)[0];
    if (!url) continue;
    const title = block.match(/^\s*(?:Study|Title):\s*(.+)$/im)?.[1]?.trim() || url;
    const scoreText = block.match(/Authoritative score:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
    const score = scoreText === undefined ? null : Number(scoreText);
    if (!sources.has(url)) {
      sources.set(url, {
        url,
        title,
        authoritativeScore: score !== null && Number.isFinite(score) ? score : null,
      });
    } else if (score !== null && Number.isFinite(score)) {
      const current = sources.get(url);
      if (current) current.authoritativeScore = score;
    }
  }
  for (const url of reportUrls(report)) {
    if (!sources.has(url)) sources.set(url, { url, title: url, authoritativeScore: null });
  }
  return Array.from(sources.values());
}

function supportingStudyNotes(supportingStudy: string | null): string {
  return (supportingStudy ?? "")
    .split(/\n\s*\n/)
    .filter((block) => !/^\s*Study:[\s\S]*\nSource:\s*https?:\/\//i.test(block))
    .join("\n\n")
    .replace(/https?:\/\/[^\s<>"')]+/g, "")
    .trim();
}

type StudySourceDisplay = {
  url: string;
  title: string;
  authoritativeScore: number | null;
  evidenceId?: string | null;
};

function parseChatStudySources(value: unknown): StudySourceDisplay[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.url !== "string" || typeof item.title !== "string") return [];
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      return [];
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    return [{
      url: url.toString(),
      title: item.title,
      authoritativeScore: typeof item.authoritativeScore === "number"
        && Number.isFinite(item.authoritativeScore)
        ? item.authoritativeScore
        : null,
      evidenceId: typeof item.evidenceId === "string" ? item.evidenceId : null,
    }];
  });
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

function localDateInputValue(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export default function MarketingWorkspace() {
  const [search, setSearch] = useState("");
  const [claimFilter, setClaimFilter] = useState("All claims");
  const [openFolder, setOpenFolder] = useState("");
  const [claim, setClaim] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStudySearching, setChatStudySearching] = useState(false);
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
  const [rdPortalOpen, setRdPortalOpen] = useState(false);
  const [rdStudyTitle, setRdStudyTitle] = useState("");
  const [rdProductIngredient, setRdProductIngredient] = useState("");
  const [rdEvidenceType, setRdEvidenceType] = useState<RdEvidenceType>("Clinical Study");
  const [rdAuthorSource, setRdAuthorSource] = useState(RD_DEFAULT_AUTHOR_SOURCE);
  const [rdPublicationDate, setRdPublicationDate] = useState(localDateInputValue);
  const [rdStudyText, setRdStudyText] = useState("");
  const [rdFileName, setRdFileName] = useState("");
  const [rdFileBase64, setRdFileBase64] = useState("");
  const [rdFileMimeType, setRdFileMimeType] = useState("");
  const [rdUploading, setRdUploading] = useState(false);
  const [rdResult, setRdResult] = useState<RdUploadResult | null>(null);
  const [rdError, setRdError] = useState("");
  const [rdCatalogSyncing, setRdCatalogSyncing] = useState(false);
  const [rdCatalogSyncResult, setRdCatalogSyncResult] = useState<RdCatalogSyncResult | null>(null);
  const [rdCatalogSyncError, setRdCatalogSyncError] = useState("");
  const [rdDragOver, setRdDragOver] = useState(false);
  const claimThreadsRef = useRef<ClaimThread[]>([]);
  const activeThreadIdRef = useRef("main");
  const unreadThreadIdsRef = useRef(new Set<string>());
  const rdFileInputRef = useRef<HTMLInputElement>(null);

  function resetRdStudyForm() {
    setRdStudyTitle("");
    setRdProductIngredient("");
    setRdEvidenceType("Clinical Study");
    setRdAuthorSource(RD_DEFAULT_AUTHOR_SOURCE);
    setRdPublicationDate(localDateInputValue());
    setRdStudyText("");
    setRdFileName("");
    setRdFileBase64("");
    setRdFileMimeType("");
    setRdResult(null);
    setRdError("");
    setRdDragOver(false);
    if (rdFileInputRef.current) rdFileInputRef.current.value = "";
  }

  async function selectRdFile(file: File) {
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["pdf", "txt", "md"].includes(extension)) {
        setRdError("Choose a PDF, TXT, or Markdown study file.");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        setRdError("PDF files must be 12 MB or smaller.");
        return;
      }
      setRdError("");
      setRdResult(null);
      setRdFileName(file.name);
      if (extension !== "pdf") {
        setRdFileBase64("");
        setRdFileMimeType("");
        setRdStudyText(await file.text());
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        const end = Math.min(index + 0x8000, bytes.length);
        for (let byteIndex = index; byteIndex < end; byteIndex += 1) {
          binary += String.fromCharCode(bytes[byteIndex]);
        }
      }
      setRdStudyText("");
      setRdFileBase64(btoa(binary));
      setRdFileMimeType("application/pdf");
    } catch (error) {
      setRdError(error instanceof Error ? `Could not read the selected study file: ${error.message}` : "Could not read the selected study file.");
      setRdFileName("");
      setRdFileBase64("");
      setRdFileMimeType("");
    }
  }

  async function submitRdStudy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRdError("");
    setRdResult(null);
    setRdUploading(true);
    try {
      const response = await fetch("/api/rd-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyTitle: rdStudyTitle,
          productIngredient: rdProductIngredient,
          evidenceType: rdEvidenceType,
          authorSource: rdAuthorSource,
          publicationDate: rdPublicationDate,
          studyText: rdStudyText,
          ...(rdFileBase64 ? {
            fileBase64: rdFileBase64,
            fileMimeType: rdFileMimeType,
            fileName: rdFileName,
          } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isRecord(payload) || payload.ok !== true
        || typeof payload.evidenceId !== "string"
        || typeof payload.chunksStored !== "number"
        || typeof payload.summary !== "string"
        || typeof payload.webViewLink !== "string") {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "The R&D study could not be uploaded.";
        throw new Error(message);
      }
      setRdResult({
        evidenceId: payload.evidenceId,
        chunksStored: payload.chunksStored,
        summary: payload.summary,
        webViewLink: payload.webViewLink,
        ...(typeof payload.driveUploadWarning === "string"
          ? { driveUploadWarning: payload.driveUploadWarning }
          : {}),
      });
    } catch (error) {
      setRdError(error instanceof Error ? error.message : "The R&D study could not be uploaded.");
    } finally {
      setRdUploading(false);
    }
  }

  async function syncEvidenceCatalog() {
    setRdCatalogSyncing(true);
    setRdCatalogSyncError("");
    setRdCatalogSyncResult(null);
    try {
      const response = await fetch("/api/sync-catalog", { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok || !isRecord(payload) || payload.ok !== true
        || typeof payload.syncedRows !== "number"
        || typeof payload.chunksSynced !== "number"
        || typeof payload.graphNodesSynced !== "number"
        || typeof payload.graphEdgesSynced !== "number") {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "The Evidence Catalog could not be synced.";
        throw new Error(message);
      }
      const result = {
        syncedRows: payload.syncedRows,
        chunksSynced: payload.chunksSynced,
        graphNodesSynced: payload.graphNodesSynced,
        graphEdgesSynced: payload.graphEdgesSynced,
      };
      setRdCatalogSyncResult(result);
      toast.success(`${result.syncedRows} Evidence Catalog ${result.syncedRows === 1 ? "study" : "studies"} synced to Supabase.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Evidence Catalog could not be synced.";
      setRdCatalogSyncError(message);
      toast.error("Could not sync Evidence Catalog", { description: message });
    } finally {
      setRdCatalogSyncing(false);
    }
  }

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
    if (!supabase) {
      setThreadsLoading(false);
      return;
    }

    const client = supabase;
    let active = true;
    let refreshing = false;
    function notifyCompletedTransition(thread: ClaimThread, previous?: ClaimThread) {
      if (thread.status !== "completed" || previous?.status === "completed") return;
      if (activeThreadIdRef.current !== thread.id && !unreadThreadIdsRef.current.has(thread.id)) {
        const nextUnread = new Set(unreadThreadIdsRef.current);
        nextUnread.add(thread.id);
        unreadThreadIdsRef.current = nextUnread;
        setUnreadThreadIds(nextUnread);
      }
      toast.success(`Analysis complete: ${thread.topic_title || "Claim audit"}`);
    }
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

        if (payload.eventType === "UPDATE") notifyCompletedTransition(thread, previous);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          toast.error("Live claim updates are unavailable", { description: "Refresh to check for audit updates." });
        }
      });

    async function loadClaimThreads(initialLoad = false) {
      if (refreshing) return;
      refreshing = true;
      try {
        const { data, error } = await client
          .from("claim_submissions")
          .select(CLAIM_THREAD_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(100);
        if (!active) return;
        if (error) {
          if (initialLoad) {
            setThreadsLoading(false);
            toast.error("Could not load claim audits", { description: error.message });
          } else {
            console.error("Could not refresh claim audits.", error);
          }
          return;
        }

        const loaded = (data ?? []).map(parseClaimThread).filter((thread): thread is ClaimThread => thread !== null);
        const merged = new Map(loaded.map((thread) => [thread.id, thread]));
        claimThreadsRef.current.forEach((thread) => {
          if (!merged.has(thread.id)) merged.set(thread.id, thread);
        });
        if (!initialLoad) {
          for (const thread of loaded) {
            const previous = claimThreadsRef.current.find((item) => item.id === thread.id);
            notifyCompletedTransition(thread, previous);
          }
        }
        const nextThreads = Array.from(merged.values()).sort((left, right) => right.created_at.localeCompare(left.created_at));
        claimThreadsRef.current = nextThreads;
        setClaimThreads(nextThreads);
        setThreadsLoading(false);
      } finally {
        refreshing = false;
      }
    }
    void loadClaimThreads(true);

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadClaimThreads();
    }, 5_000);
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void loadClaimThreads();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshOnVisible);
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
  const selectedClaimStudySources = selectedClaim
    ? parseStudySources(selectedClaim.supporting_study, selectedClaim.ai_evaluation)
    : [];
  const selectedClaimStudyNotes = selectedClaim ? supportingStudyNotes(selectedClaim.supporting_study) : "";
  const claimCategoryCount = new Set(claimThreads.map((thread) => claimCategory(thread.target_tier))).size;
  const pendingClaimCount = claimThreads.filter((thread) => thread.status === "pending" || thread.status === "processing").length;

  function trackClaimThread(thread: ClaimThread) {
    const nextThreads = upsertClaimThread(claimThreadsRef.current, thread);
    claimThreadsRef.current = nextThreads;
    setClaimThreads(nextThreads);
    setRecentThreadIds((current) => [thread.id, ...current.filter((id) => id !== thread.id)].slice(0, MAX_RECENT_THREADS));
  }

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

  async function sendChatTurn(
    messageText: string,
    requestedSearch?: { claim: string },
  ) {
    const content = messageText.trim();
    if (!content || chatLoading) return;

    const userMessage: ChatMessage = { role: "user", content };
    const conversation = [...chatMessages.slice(-19), userMessage];
    setChatMessages(conversation);
    setChatInput("");
    setChatLoading(true);
    setChatStudySearching(Boolean(requestedSearch));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation,
          ...(requestedSearch ? {
            workshoppedClaim: requestedSearch.claim,
            searchExternal: true,
          } : {}),
        }),
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
      const replyWorkshoppedClaim = typeof payload.workshoppedClaim === "string"
        && payload.workshoppedClaim.trim().length <= 180
        ? payload.workshoppedClaim.trim()
        : auditReady?.[1].trim();
      if (replyWorkshoppedClaim) {
        setClaim(replyWorkshoppedClaim);
      }
      const studySources = parseChatStudySources(payload.studySources);
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantContent || "This claim is ready to prepare for review.",
        ...(replyWorkshoppedClaim ? { workshoppedClaim: replyWorkshoppedClaim } : {}),
        ...(studySources.length > 0 ? { studySources } : {}),
      };
      setChatMessages([...conversation, assistantMessage].slice(-20));
    } catch (error) {
      setChatMessages(chatMessages);
      if (!requestedSearch) setChatInput(content);
      toast.error("Could not get a chat reply", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setChatLoading(false);
      setChatStudySearching(false);
    }
  }

  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendChatTurn(chatInput);
  }

  function searchWithFirecrawl(claimText: string) {
    void sendChatTurn(
      "Search the internal evidence library and external scientific sources via Firecrawl for this claim.",
      { claim: claimText },
    );
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
        ? `Audited claim: ${thread.proposed_claim}\nAudit findings: ${(thread.ai_evaluation || "The audit is still processing.").slice(0, 4000)}\nLinked study details: ${(thread.supporting_study || "No linked study details were provided.").slice(0, 3000)}`
        : "The audit details are not currently available.";
      const previousMessages: ChatMessage[] = threadMessages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-4)
        .map(({ role, content: messageContent }) => ({ role, content: messageContent.slice(-1000) }));
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...previousMessages, { role: "user", content }],
          auditContext: context,
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
          <div className="fd-user-area">
            <button className="rd-portal-trigger" type="button" onClick={() => setRdPortalOpen(true)}>
              <Beaker aria-hidden="true" /><span>R&amp;D Study Portal</span><i>R&amp;D</i>
            </button>
            <div className="fd-team"><i />Marketing team <b>·</b> Ivy Evergreen</div><div className="fd-avatar">AR</div>
          </div>
        </div>

        <header className="fd-hero">
          <h1 className="fd-hero-title">Good claims start<br />with <em>good evidence.</em></h1>
          <div className="fd-hero-aside">
            <p>Shape the claim, then find research that can help ground the wording in evidence.</p>
            <div className="fd-steps" aria-label="Claim drafting steps"><span><b>1</b>Write the claim</span><span><b>2</b>Find a study</span><span><b>3</b>Review evidence</span></div>
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
                  {selectedClaimStudyNotes && <p>{selectedClaimStudyNotes}</p>}
                  {selectedClaimStudySources.length === 0 && <span>No supporting study was linked directly.</span>}
                  {selectedClaimStudySources.map((study) => <div className="fd-study-source" key={study.url}>
                    <a href={study.url} target="_blank" rel="noreferrer">{study.title}</a>
                    <span>Authoritative score: {study.authoritativeScore === null ? "Not available" : study.authoritativeScore.toFixed(2)}</span>
                  </div>)}
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
                  <textarea id="claim-thread-input" value={threadInput} onChange={(event) => setThreadInput(event.target.value)} maxLength={3000} placeholder="Suggest a revision or ask whether the studies support it…" required />
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
                  {message.studySources?.map((source) => <a
                    className="fd-chat-source"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={source.url}
                  >
                    {source.evidenceId ? `${source.evidenceId} · ` : ""}{source.title}
                  </a>)}
                </div>)}
                {chatLoading && <div className="fd-chat-message is-assistant" role="status">{chatStudySearching ? <Search aria-hidden="true" /> : <Sparkles aria-hidden="true" />}<p>{chatStudySearching ? "Searching the evidence library and external studies…" : "Thinking through the claim…"}</p></div>}
              </div>
              <form className="fd-chat-compose" onSubmit={sendChatMessage}>
                <label className="fd-sr-only" htmlFor="claim-chat-input">Message Ivy</label>
                <textarea id="claim-chat-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Describe the product benefit or claim you want to explore..." maxLength={3000} required />
                <button type="submit" aria-label="Send message" disabled={chatLoading || !chatInput.trim()}><Send aria-hidden="true" /></button>
              </form>
              <p className="fd-chat-foot">AI brainstorming is not legal advice. Claims need human review.</p>
            </div>
            {claim && <div className="fd-form fd-claim-review">
              <label className="fd-field fd-claim-field">
                <span className="fd-field-head"><span className="fd-field-label">Proposed claim</span><span className="fd-field-meta">{claim.length} / 180</span></span>
                <textarea value={claim} onChange={(event) => setClaim(event.target.value)} maxLength={180} required />
              </label>
              <button
                className="fd-find-studies"
                type="button"
                disabled={chatLoading || !claim.trim()}
                onClick={() => searchWithFirecrawl(claim.trim())}
              >
                {chatLoading ? "Finding studies..." : "Find Studies"}
                {chatLoading ? <LoaderCircle aria-hidden="true" /> : <Search aria-hidden="true" />}
              </button>
            </div>}
          </section>
        </div>
        <footer className="fd-footer"><span>Claims Portal · Ivy Evergreen</span><span>Research informed · Copy ready</span></footer>
      </main>
      {rdPortalOpen && <div className="rd-portal-overlay">
        <section className="rd-portal-view" role="dialog" aria-modal="true" aria-labelledby="rd-portal-heading">
          <header className="rd-portal-header">
            <button className="rd-back-button" type="button" onClick={() => setRdPortalOpen(false)}>
              <ArrowLeft aria-hidden="true" /> Back to compliance workspace
            </button>
            <div className="rd-portal-brand"><span><Beaker aria-hidden="true" /></span><div><small>Evidence Catalog · Dedicated intake</small><h1 id="rd-portal-heading">R&amp;D Study Portal</h1></div></div>
            <button className="rd-close-button" type="button" onClick={() => setRdPortalOpen(false)} aria-label="Close R&D Study Portal"><X aria-hidden="true" /></button>
          </header>
          <div className="rd-portal-content">
            <div className="rd-portal-intro">
              <span className="rd-portal-kicker">Research ingestion</span>
              <h2>Bring your study<br /><em>into the evidence library.</em></h2>
              <p>Upload an internal study or paste its text. We’ll extract the study details, store searchable sections, and add this R&amp;D record to the Evidence Catalog sheet.</p>
              <div className="rd-ingestion-note"><FileCheck2 aria-hidden="true" /><span>R&amp;D submissions are kept separate from claim audits.</span></div>
            </div>
            <form className="rd-study-form" onSubmit={submitRdStudy}>
              <div className="rd-form-heading"><div><span className="rd-portal-kicker">New submission</span><h3>Study details</h3></div><span className="rd-required-note">* Required</span></div>
              <div className="rd-catalog-sync">
                <button className="rd-catalog-sync-button" type="button" onClick={() => void syncEvidenceCatalog()} disabled={rdCatalogSyncing || rdUploading}>
                  {rdCatalogSyncing ? <LoaderCircle className="rd-spinner" aria-hidden="true" /> : <Layers3 aria-hidden="true" />}
                  {rdCatalogSyncing ? "Syncing Evidence Catalog..." : "Sync Sheet to DB"}
                </button>
                {rdCatalogSyncResult && <p role="status">{rdCatalogSyncResult.syncedRows} studies, {rdCatalogSyncResult.chunksSynced} chunks, and {rdCatalogSyncResult.graphNodesSynced} graph nodes synced.</p>}
                {rdCatalogSyncError && <p role="alert">{rdCatalogSyncError}</p>}
              </div>
              <label className="rd-field rd-field-wide">
                <span>Study Title <b>*</b></span>
                <input value={rdStudyTitle} onChange={(event) => { setRdStudyTitle(event.target.value); setRdResult(null); }} maxLength={300} placeholder="e.g., Effects of daily fiber intake on digestive comfort" required />
              </label>
              <div className="rd-field-grid">
                <label className="rd-field">
                  <span>Product / Ingredient</span>
                  <input list="rd-product-options" value={rdProductIngredient} onChange={(event) => setRdProductIngredient(event.target.value)} maxLength={300} placeholder="Select or enter a custom ingredient" />
                  <datalist id="rd-product-options">
                    <option value="Fruits & Veggies" />
                    <option value="Fiber & Spice" />
                    <option value="Whole Health System" />
                    <option value="Guiltless Snacks" />
                  </datalist>
                </label>
                <label className="rd-field">
                  <span>Evidence Type</span>
                  <select value={rdEvidenceType} onChange={(event) => setRdEvidenceType(event.target.value as RdEvidenceType)}>
                    {RD_EVIDENCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="rd-field">
                  <span>Author / Source</span>
                  <input value={rdAuthorSource} onChange={(event) => setRdAuthorSource(event.target.value)} maxLength={300} />
                </label>
                <label className="rd-field">
                  <span>Publication / Test Date</span>
                  <input type="date" value={rdPublicationDate} onChange={(event) => setRdPublicationDate(event.target.value)} required />
                </label>
              </div>
              <div className="rd-study-input-heading"><div><span className="rd-field-label">Study Document Input</span><small>Choose a file or paste the readable study text.</small></div></div>
              <div
                className={`rd-dropzone${rdDragOver ? " is-dragging" : ""}`}
                onDragOver={(event) => { event.preventDefault(); setRdDragOver(true); }}
                onDragLeave={() => setRdDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setRdDragOver(false);
                  const file = event.dataTransfer.files[0];
                  if (file) void selectRdFile(file);
                }}
              >
                <input
                  ref={rdFileInputRef}
                  className="rd-file-input"
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void selectRdFile(file);
                    event.currentTarget.value = "";
                  }}
                  aria-label="Upload a PDF, TXT, or Markdown study file"
                />
                <span className="rd-upload-icon"><Upload aria-hidden="true" /></span>
                <div><strong>{rdFileName || "Drop your study file here"}</strong><span>PDF, TXT, or Markdown · PDF max 12 MB</span></div>
                <button type="button" onClick={() => rdFileInputRef.current?.click()}>Browse files</button>
              </div>
              {rdFileBase64 && <p className="rd-file-hint"><FileText aria-hidden="true" /> PDF will be securely sent to Gemini for native text extraction.</p>}
              <label className="rd-field rd-paste-field">
                <span>Paste Study Text <small>Optional when uploading a PDF; required when no file is selected.</small></span>
                <textarea value={rdStudyText} onChange={(event) => { setRdStudyText(event.target.value); setRdResult(null); }} maxLength={200000} placeholder="Paste the full study text, including methods, population, results, and conclusions…" />
              </label>
              {rdError && <p className="rd-form-error" role="alert">{rdError}</p>}
              {rdUploading && <div className="rd-upload-progress" role="status" aria-live="polite">
                <div className="rd-progress-current"><span className="rd-progress-number">01</span><span>Extracting study metadata while uploading the PDF to Drive...</span></div>
                <div className="rd-progress-next"><span className="rd-progress-number">02</span><span>Embedding and saving to Supabase &amp; Priority Pending Studies...</span></div>
              </div>}
              {rdResult && <div className="rd-success-card" role="status">
                <CheckCircle2 aria-hidden="true" />
                <div><strong>Study ingested successfully</strong><p><b>{rdResult.evidenceId}</b> · {rdResult.chunksStored} searchable {rdResult.chunksStored === 1 ? "chunk" : "chunks"} stored in Supabase and synced to Priority Pending Studies.</p><small>{rdResult.summary}</small>{rdResult.driveUploadWarning && <p className="rd-drive-warning" role="alert">The study was ingested, but its PDF was not archived in Google Drive: {rdResult.driveUploadWarning}</p>}{rdResult.webViewLink && <a className="rd-drive-link" href={rdResult.webViewLink} target="_blank" rel="noreferrer">View Study in Drive</a>}<button className="rd-reset-button" type="button" onClick={resetRdStudyForm}>Start another upload</button></div>
              </div>}
              <button className="rd-submit-button" type="submit" disabled={rdUploading || (!rdFileBase64 && !rdStudyText.trim())}>
                {rdUploading ? "Extracting study metadata & embeddings..." : "Ingest R&D Study"}
                {rdUploading ? <LoaderCircle className="rd-spinner" aria-hidden="true" /> : <Send aria-hidden="true" />}
              </button>
              <p className="rd-form-foot">Only submissions from this portal are pushed to the R&amp;D Evidence Catalog sheet.</p>
            </form>
          </div>
        </section>
      </div>}
    </div>
  );
}
