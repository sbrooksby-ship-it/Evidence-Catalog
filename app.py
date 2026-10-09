import streamlit as st
from supabase import create_client
import PyPDF2

# ==========================================
# PAGE CONFIG & ENHANCED DESIGN SYSTEM
# ==========================================
st.set_page_config(
    page_title="Corporate Claims & Compliance Portal",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom High-End SaaS CSS
st.markdown("""
    <style>
    /* Global Typography & Background */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    html, body, .stApp {
        background-color: #F8FAFC;
        font-family: 'Inter', sans-serif;
        color: #0F172A;
    }
    
    /* Header Banner Styling */
    .header-container {
        background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
        padding: 24px 32px;
        border-radius: 12px;
        color: white;
        margin-bottom: 24px;
        box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.08);
    }
    .header-title { font-size: 1.75rem; font-weight: 700; margin: 0; color: #FFFFFF; }
    .header-subtitle { color: #94A3B8; font-size: 0.95rem; margin-top: 4px; }
    
    /* KPI Metric Cards */
    div[data-testid="stMetric"] {
        background-color: #FFFFFF;
        border: 1px solid #E2E8F0;
        padding: 16px 20px;
        border-radius: 10px;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
    }
    div[data-testid="stMetricLabel"] { font-size: 0.85rem; font-weight: 600; color: #64748B; }
    div[data-testid="stMetricValue"] { font-size: 1.8rem; font-weight: 700; color: #0F172A; }
    
    /* Expander Card Polish */
    div[data-testid="stExpander"] {
        background-color: #FFFFFF;
        border-radius: 10px;
        border: 1px solid #E2E8F0 !important;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04);
        margin-bottom: 12px;
    }
    div[data-testid="stExpander"] > details > summary {
        font-weight: 600;
        font-size: 1.02rem;
        padding: 14px 18px;
    }

    /* Custom Badges */
    .badge {
        display: inline-block;
        padding: 4px 12px;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 6px;
        margin-right: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .badge-t1 { background-color: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
    .badge-t2 { background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
    .badge-t3 { background-color: #FDF2F8; color: #BE185D; border: 1px solid #FBCFE8; }
    .badge-active { background-color: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0; }
    .badge-outdated { background-color: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; }
    .badge-pending { background-color: #FEFCE8; color: #A16207; border: 1px solid #FEF08A; }
    .badge-revoked { background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; }
    </style>
""", unsafe_allow_html=True)

def render_badge(text, badge_type):
    return f'<span class="badge badge-{badge_type}">{text}</span>'

# ==========================================
# DATABASE CONNECTION
# ==========================================
@st.cache_resource
def init_supabase():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_supabase()

# ==========================================
# AUTHENTICATION & SESSION STATE
# ==========================================
if "user" not in st.session_state:
    st.session_state.user = None
if "user_role" not in st.session_state:
    st.session_state.user_role = None

sidebar = st.sidebar
with sidebar:
    st.image("https://img.icons8.com/color/96/shield.png", width=48)
    st.title("Compliance Hub")
    st.markdown("---")

if not st.session_state.user:
    with sidebar.form("login_form"):
        st.subheader("🔒 Sign In")
        email = st.text_input("Email", placeholder="user@company.com")
        password = st.text_input("Password", type="password")
        login_btn = st.form_submit_button("Log In", use_container_width=True)
        
        if login_btn:
            try:
                auth_resp = supabase.auth.sign_in_with_password({"email": email, "password": password})
                st.session_state.user = auth_resp.user
                user_email = auth_resp.user.email.lower() if auth_resp.user.email else ""
                st.session_state.user_role = "Legal & Compliance" if "legal" in user_email else "Marketing Team"
                st.rerun()
            except Exception:
                st.error("Invalid credentials. Please verify your email/password.")
    st.info("👈 Please log in via the sidebar.")
    st.stop()

with sidebar:
    st.markdown(f"👤 **User:** `{st.session_state.user.email}`")
    st.markdown(f"🏷️ **Role:** `{st.session_state.user_role}`")
    st.markdown("---")
    if st.button("Log Out", use_container_width=True):
        supabase.auth.sign_out()
        st.session_state.user = None
        st.session_state.user_role = None
        st.rerun()


# ==========================================
# MODAL DIALOGS
# ==========================================
@st.dialog("➕ Upload New Clinical Document", width="large")
def upload_evidence_modal():
    st.caption("Extract text from PDFs or Markdown files directly into the catalog.")
    with st.form("add_study_form", clear_on_submit=True):
        study_title = st.text_input("Study Title", placeholder="e.g., Clinical Trial #402")
        evidence_type = st.selectbox("Type", ["Clinical Trial", "Literature Review", "Lab Assay", "Other"])
        study_desc = st.text_area("Findings Summary", height=100)
        uploaded_file = st.file_uploader("Source File", type=["pdf", "md", "txt"])
        
        if st.form_submit_button("Extract & Publish", type="primary", use_container_width=True):
            if not study_title or not uploaded_file:
                st.warning("Title and file are required.")
            else:
                extracted_text = ""
                if uploaded_file.name.lower().endswith(".pdf"):
                    try:
                        pdf_reader = PyPDF2.PdfReader(uploaded_file)
                        for page in pdf_reader.pages:
                            txt = page.extract_text()
                            if txt: extracted_text += txt + "\n\n"
                    except Exception as e:
                        st.error(f"PDF error: {e}")
                else:
                    extracted_text = uploaded_file.getvalue().decode("utf-8")
                
                if extracted_text:
                    supabase.table("evidence").insert({
                        "title": study_title,
                        "evidence_type": evidence_type,
                        "added_by": st.session_state.user.email,
                        "description": study_desc,
                        "study_content": extracted_text,
                        "status": "Active"
                    }).execute()
                    st.success("Study published!")
                    st.rerun()

@st.dialog("✏️ Edit Master Claim Details")
def edit_claim_modal(claim_data, evidence_dict):
    st.caption("Update copy text, adjust compliance tier, or assign new supporting evidence.")
    updated_text = st.text_area("Master Claim Copy", value=claim_data.get('claim_text', ''), height=120)
    
    current_ev_id = claim_data.get('evidence_id')
    current_ev_title = "None"
    if current_ev_id:
        for title, eid in evidence_dict.items():
            if eid == current_ev_id:
                current_ev_title = title
                break
                
    new_ev_title = st.selectbox(
        "Linked Clinical Study", 
        list(evidence_dict.keys()), 
        index=list(evidence_dict.keys()).index(current_ev_title) if current_ev_title in evidence_dict else 0
    )
    
    col_t, col_s = st.columns(2)
    with col_t:
        tier_opts = ["T1 (Primary)", "T2 (Substantiated)", "T3 (Qualified)"]
        curr_t = claim_data.get('tier', 'T3')
        t_idx = next((i for i, opt in enumerate(tier_opts) if curr_t[:2] in opt), 0)
        new_tier = st.selectbox("Regulatory Tier", tier_opts, index=t_idx)
    with col_s:
        status_opts = ["Approved", "Revoked"]
        curr_s = claim_data.get('status', 'Approved')
        s_idx = 0 if curr_s == "Approved" else 1
        new_status = st.selectbox("Status", status_opts, index=s_idx)
        
    st.markdown("<br>", unsafe_allow_html=True)
    if st.button("💾 Save & Commit Changes", type="primary", use_container_width=True):
        supabase.table("claims").update({
            "claim_text": updated_text,
            "tier": new_tier.split()[0],
            "status": new_status,
            "evidence_id": evidence_dict[new_ev_title]
        }).eq("id", claim_data['id']).execute()
        st.toast("Claim updated successfully!")
        st.rerun()

@st.dialog("📄 Source Document Text", width="large")
def view_study_modal(study_title, study_content):
    st.subheader(study_title)
    st.divider()
    if study_content:
        st.markdown(study_content)
    else:
        st.info("No extracted text available for this document.")


# ==============================================================================
# MARKETING VIEW
# ==============================================================================
if st.session_state.user_role == "Marketing Team":
    st.markdown("""
        <div class="header-container">
            <div class="header-title">🚀 Marketing Submissions</div>
            <div class="header-subtitle">Submit proposed campaign copy for compliance verification and study linkage.</div>
        </div>
    """, unsafe_allow_html=True)
    
    evidence_options = {}
    try:
        ev_resp = supabase.table("evidence").select("id, title").eq("status", "Active").execute()
        if ev_resp.data:
            evidence_options = {e['title']: e['id'] for e in ev_resp.data}
    except Exception:
        pass

    with st.container(border=True):
        st.subheader("📝 Draft Proposed Copy")
        with st.form("marketing_claim_form", clear_on_submit=True):
            proposed_claim = st.text_area("Proposed Claim Text", placeholder="e.g., Clinical trials prove improved gut motility within 14 days...", height=110)
            
            col_tier, col_study = st.columns(2)
            with col_tier:
                target_tier = st.selectbox("Target Claim Tier", ["T2 (Substantiated)", "T3 (Qualified)"])
            with col_study:
                selected_study_title = st.selectbox("Link Supporting Study (Optional)", ["None"] + list(evidence_options.keys()))
            
            st.markdown("<br>", unsafe_allow_html=True)
            submit_btn = st.form_submit_button("Submit for Legal Review", type="primary", use_container_width=True)
            
            if submit_btn:
                if not proposed_claim:
                    st.warning("Please enter proposed copy before submitting.")
                else:
                    linked_evidence_id = evidence_options.get(selected_study_title) if selected_study_title != "None" else None
                    payload = {
                        "proposed_claim": proposed_claim,
                        "target_tier": target_tier.split()[0],
                        "submitted_by": st.session_state.user.email,
                        "human_status": "Pending Review",
                        "evidence_id": linked_evidence_id
                    }
                    supabase.table("claim_submissions").insert(payload).execute()
                    st.success("✅ Submitted to Legal Review Queue!")
                    st.rerun()


# ==============================================================================
# LEGAL & COMPLIANCE VIEW
# ==============================================================================
elif st.session_state.user_role == "Legal & Compliance":
    st.markdown("""
        <div class="header-container">
            <div class="header-title">🛡️ Compliance Command Center</div>
            <div class="header-subtitle">Audit clinical evidence, review marketing copy submissions, and manage the master claim registry.</div>
        </div>
    """, unsafe_allow_html=True)

    # 1. TOP-LEVEL KPI DASHBOARD
    try:
        ev_count = len(supabase.table("evidence").select("id", count="exact").eq("status", "Active").execute().data or [])
        pending_count = len(supabase.table("claim_submissions").select("id", count="exact").eq("human_status", "Pending Review").execute().data or [])
        claims_count = len(supabase.table("claims").select("id", count="exact").eq("status", "Approved").execute().data or [])
        outdated_count = len(supabase.table("evidence").select("id", count="exact").eq("status", "Outdated").execute().data or [])
        
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Active Evidence", ev_count)
        m2.metric("Pending Review Queue", pending_count, delta="Action Needed" if pending_count > 0 else "Clear", delta_color="inverse")
        m3.metric("Approved Master Claims", claims_count)
        m4.metric("Outdated Studies", outdated_count)
    except Exception:
        pass

    st.markdown("<br>", unsafe_allow_html=True)

    # 2. MAIN WORKSPACE TABS
    tab_evidence, tab_pipeline, tab_claims = st.tabs(["🔬 Evidence Catalog", "⚖️ Review Queue", "📋 Master Claims Registry"])

    # --------------------------------------------------------------------------
    # TAB 1: EVIDENCE CATALOG
    # --------------------------------------------------------------------------
    with tab_evidence:
        ev_col_main, ev_col_side = st.columns([7, 3], gap="large")
        
        with ev_col_side:
            st.markdown("### 🎛️ Catalog Controls")
            
            # Replaced inline form with a popup modal button
            if st.button("➕ Upload New Evidence", type="primary", use_container_width=True):
                upload_evidence_modal()
                
            st.divider()
            search_query = st.text_input("🔍 Keyword Search", placeholder="Title or findings...")
            st.markdown("**Filter by Status**")
            status_filter = st.radio("Status Filter", ["All Studies", "Active Only", "Outdated Only"], horizontal=True, label_visibility="collapsed")
            
        with ev_col_main:
            st.markdown("### 📚 Scientific Library")
            try:
                evidence_resp = supabase.table("evidence").select("*").order("created_at", desc=True).execute()
                evidence_data = evidence_resp.data or []
                
                # Apply Filters
                if status_filter == "Active Only":
                    evidence_data = [e for e in evidence_data if e.get('status') == 'Active']
                elif status_filter == "Outdated Only":
                    evidence_data = [e for e in evidence_data if e.get('status') == 'Outdated']
                    
                if search_query:
                    q = search_query.lower()
                    evidence_data = [e for e in evidence_data if q in str(e.get('title', '')).lower() or q in str(e.get('description', '')).lower()]
                
                if not evidence_data:
                    st.info("No studies match your current filters.")
                    
                for study in evidence_data:
                    is_active = study.get('status') == 'Active'
                    status_icon = "🟢" if is_active else "⚪"
                    
                    # Converted back to expanders so they are compact and space-efficient
                    with st.expander(f"{status_icon} {study.get('title', 'Untitled Study')}"):
                        st.markdown(f"""
                            {render_badge(study.get('status', 'Active'), 'active' if is_active else 'outdated')}
                            {render_badge(study.get('evidence_type', 'N/A'), 'outdated')}
                        """, unsafe_allow_html=True)
                        
                        st.write(f"**Findings:** {study.get('description', 'N/A')}")
                        
                        try:
                            approved = supabase.table("claims").select("*").eq("evidence_id", study['id']).eq("status", "Approved").execute().data
                            if approved:
                                st.caption("🔗 Linked Approved Claims:")
                                for c in approved:
                                    t = str(c.get('tier', 'T3')).lower()
                                    st.markdown(f"> {render_badge(c.get('tier', 'T3'), t if t in ['t1','t2','t3'] else 'active')} {c.get('claim_text', '')}", unsafe_allow_html=True)
                        except Exception:
                            pass
                        
                        st.markdown("<br>", unsafe_allow_html=True)
                        action_col1, action_col2, _ = st.columns([2, 2, 6])
                        with action_col1:
                            if st.button("📄 Read Document", key=f"read_{study['id']}", use_container_width=True):
                                view_study_modal(study.get('title'), study.get('study_content'))
                        with action_col2:
                            if is_active:
                                if st.button("🗄️ Mark Outdated", key=f"outdate_{study['id']}", type="secondary", use_container_width=True):
                                    supabase.table("evidence").update({"status": "Outdated"}).eq("id", study['id']).execute()
                                    st.rerun()
            except Exception as e:
                st.error(f"Error loading evidence: {e}")

    # --------------------------------------------------------------------------
    # TAB 2: REVIEW QUEUE
    # --------------------------------------------------------------------------
    with tab_pipeline:
        st.markdown("### ⚖️ Pending Legal Review")
        try:
            pending_resp = supabase.table("claim_submissions").select("*").eq("human_status", "Pending Review").order("created_at", desc=False).execute()
            pending_claims = pending_resp.data or []
            
            if not pending_claims:
                st.success("🎉 Inbox Zero! All claim submissions have been reviewed.")
            else:
                for claim in pending_claims:
                    with st.expander(f"⏳ {claim['proposed_claim'][:60]}..."):
                        st.markdown(f"#### Proposed Copy")
                        st.info(f"**{claim['proposed_claim']}**")
                        
                        col_meta, col_actions = st.columns([3, 1])
                        with col_meta:
                            tier = claim.get('target_tier', 'T3')
                            st.markdown(f"{render_badge('TARGET: ' + tier, tier.lower() if tier.lower() in ['t1','t2','t3'] else 'pending')} **Author:** {claim['submitted_by']}", unsafe_allow_html=True)
                            
                            if claim.get("evidence_id"):
                                try:
                                    ev = supabase.table("evidence").select("title").eq("id", claim["evidence_id"]).single().execute()
                                    if ev.data:
                                        st.caption(f"📄 **Linked Study:** `{ev.data['title']}`")
                                except Exception:
                                    pass
                        
                        with col_actions:
                            if st.button("✅ Approve", key=f"app_{claim['id']}", type="primary", use_container_width=True):
                                supabase.table("claim_submissions").update({"human_status": "Approved"}).eq("id", claim['id']).execute()
                                try:
                                    supabase.table("claims").insert({
                                        "claim_text": claim['proposed_claim'],
                                        "tier": claim['target_tier'],
                                        "evidence_id": claim.get('evidence_id'),
                                        "status": "Approved"
                                    }).execute()
                                except Exception:
                                    pass
                                st.rerun()
                            
                            if st.button("❌ Reject", key=f"rej_{claim['id']}", type="secondary", use_container_width=True):
                                supabase.table("claim_submissions").update({"human_status": "Rejected"}).eq("id", claim['id']).execute()
                                st.rerun()
        except Exception as e:
            st.error(f"Error fetching queue: {e}")

    # --------------------------------------------------------------------------
    # TAB 3: MASTER CLAIMS REGISTRY
    # --------------------------------------------------------------------------
    with tab_claims:
        mc_col_main, mc_col_side = st.columns([7, 3], gap="large")
        
        with mc_col_side:
            st.markdown("### 🎛️ Registry Controls")
            claims_search = st.text_input("🔍 Search copy...", placeholder="Enter keyword...")
            
            st.markdown("**Filter by Tier**")
            tier_filter = st.radio("Tier", ["All Tiers", "T1 (Primary)", "T2 (Substantiated)", "T3 (Qualified)"], horizontal=True, label_visibility="collapsed")
            
            st.markdown("**Filter by Status**")
            status_c_filter = st.radio("Status", ["All", "Approved", "Revoked"], horizontal=True, label_visibility="collapsed")

        with mc_col_main:
            st.markdown("### 📋 Active Master Registry")
            try:
                evidence_dict = {"None": None}
                ev_query = supabase.table("evidence").select("id, title").execute()
                if ev_query.data:
                    for e in ev_query.data:
                        evidence_dict[e['title']] = e['id']
                        
                claims_data = supabase.table("claims").select("*").order("created_at", desc=True).execute().data or []
                
                # Apply Filters
                if tier_filter != "All Tiers":
                    filter_prefix = tier_filter.split()[0] # Gets T1, T2, or T3
                    claims_data = [c for c in claims_data if c.get('tier') == filter_prefix]
                    
                if status_c_filter != "All":
                    claims_data = [c for c in claims_data if c.get('status') == status_c_filter]
                
                if claims_search:
                    q = claims_search.lower()
                    claims_data = [c for c in claims_data if q in str(c.get('claim_text', '')).lower()]

                if not claims_data:
                    st.info("No master claims match your current filters.")

                for c in claims_data:
                    status = c.get('status', 'Approved')
                    is_approved = status == "Approved"
                    tier = c.get('tier', 'T3')
                    icon = "✅" if is_approved else "🚫"
                    
                    # Back to expanders to save space
                    with st.expander(f"{icon} [{tier}] {c.get('claim_text', '')[:50]}..."):
                        col_claim_info, col_edit_btn = st.columns([5, 1])
                        with col_claim_info:
                            st.markdown(
                                f"{render_badge(tier, tier.lower() if tier.lower() in ['t1','t2','t3'] else 'active')} "
                                f"{render_badge(status, 'active' if is_approved else 'revoked')} "
                                f"**{c.get('claim_text')}**", 
                                unsafe_allow_html=True
                            )
                            
                            ev_id = c.get('evidence_id')
                            linked_title = next((title for title, eid in evidence_dict.items() if eid == ev_id), "None")
                            if linked_title != "None":
                                st.caption(f"📄 Supporting Study: {linked_title}")
                                
                        with col_edit_btn:
                            if st.button("✏️ Edit", key=f"btn_edit_{c['id']}", use_container_width=True):
                                edit_claim_modal(c, evidence_dict)
                                
            except Exception as e:
                st.error(f"Error fetching claims registry: {e}")
