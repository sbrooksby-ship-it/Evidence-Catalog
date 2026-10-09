import streamlit as st
from supabase import create_client
import PyPDF2

# ==========================================
# PAGE CONFIG & STYLING
# ==========================================
st.set_page_config(
    page_title="Corporate Claims & Compliance Portal",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- ADVANCED UI POLISH (CSS) ---
st.markdown("""
    <style>
    /* Global App Background */
    .stApp { 
        background-color: #F8FAFC; 
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    
    /* Clean SaaS Cards for Expanders */
    div[data-testid="stExpander"] {
        background-color: #FFFFFF;
        border-radius: 8px;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        border: 1px solid #E2E8F0 !important;
        margin-bottom: 12px;
    }
    div[data-testid="stExpander"] > details > summary {
        font-weight: 600;
        font-size: 1.05rem;
        color: #0F172A;
        padding: 12px 15px;
    }
    
    /* Primary Button Styling */
    div[data-testid="stButton"] button[kind="primary"] {
        background-color: #2563EB;
        color: white;
        border-radius: 6px;
        font-weight: 600;
        border: none;
        padding: 0.5rem 1rem;
        transition: all 0.2s;
    }
    div[data-testid="stButton"] button[kind="primary"]:hover {
        background-color: #1D4ED8;
    }
    
    /* Secondary Button Styling */
    div[data-testid="stButton"] button[kind="secondary"] {
        border-radius: 6px;
        border: 1px solid #CBD5E1;
        background-color: #FFFFFF;
        color: #334155;
        font-weight: 500;
        transition: all 0.2s;
    }
    div[data-testid="stButton"] button[kind="secondary"]:hover {
        background-color: #F1F5F9;
        border-color: #94A3B8;
    }
    
    /* Inputs */
    .stTextInput input, .stTextArea textarea, .stSelectbox > div > div {
        border-radius: 6px;
        border: 1px solid #CBD5E1;
    }
    
    /* Custom Badge Classes */
    .c-badge {
        display: inline-block;
        padding: 0.25em 0.75em;
        font-size: 0.85em;
        font-weight: 600;
        border-radius: 9999px;
        margin-right: 0.5em;
        margin-bottom: 0.5em;
    }
    .badge-active { background-color: #DCFCE7; color: #166534; border: 1px solid #BBF7D0; }
    .badge-outdated { background-color: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; }
    .badge-t1 { background-color: #DBEAFE; color: #1E40AF; border: 1px solid #BFDBFE; }
    .badge-t2 { background-color: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
    .badge-t3 { background-color: #FCE7F3; color: #9D174D; border: 1px solid #FBCFE8; }
    .badge-pending { background-color: #FEF9C3; color: #854D0E; border: 1px solid #FEF08A; }
    </style>
""", unsafe_allow_html=True)

# Helper function to render badges
def render_badge(text, badge_type):
    return f'<span class="c-badge badge-{badge_type}">{text}</span>'

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
    st.image("https://img.icons8.com/color/96/shield.png", width=50)
    st.title("Compliance Hub")
    st.markdown("---")

if not st.session_state.user:
    with sidebar.form("login_form"):
        st.subheader("🔒 Sign In")
        email = st.text_input("Email", placeholder="name@company.com")
        password = st.text_input("Password", type="password")
        login_btn = st.form_submit_button("Log In", use_container_width=True)
        
        if login_btn:
            try:
                auth_resp = supabase.auth.sign_in_with_password({"email": email, "password": password})
                st.session_state.user = auth_resp.user
                
                user_email = auth_resp.user.email.lower() if auth_resp.user.email else ""
                if "legal" in user_email:
                    st.session_state.user_role = "Legal & Compliance"
                else:
                    st.session_state.user_role = "Marketing Team"
                
                st.rerun()
            except Exception as e:
                st.error("Invalid credentials. Please try again.")
    
    st.info("👈 Please log in securely via the sidebar menu.")
    st.stop()

# Logged-in Sidebar Navigation
with sidebar:
    st.success(f"**User:** {st.session_state.user.email}")
    st.caption(f"**Role:** {st.session_state.user_role}")
    st.markdown("###")
    if st.button("Log Out", use_container_width=True):
        supabase.auth.sign_out()
        st.session_state.user = None
        st.session_state.user_role = None
        st.rerun()


# ==============================================================================
# MARKETING VIEW (Restricted to Claims Submissions)
# ==============================================================================
if st.session_state.user_role == "Marketing Team":
    st.title("🚀 Marketing Submission Portal")
    st.markdown("Submit new marketing copy and claims for rigorous legal review.")
    st.markdown("---")
    
    # Fetch active evidence
    evidence_options = {}
    try:
        ev_resp = supabase.table("evidence").select("id, title").eq("status", "Active").execute()
        if ev_resp.data:
            evidence_options = {e['title']: e['id'] for e in ev_resp.data}
    except Exception:
        pass

    with st.container(border=True):
        st.subheader("📝 Draft a New Claim")
        with st.form("marketing_claim_form", clear_on_submit=True):
            proposed_claim = st.text_area("Proposed Claim Copy", placeholder="e.g., Proven to increase digestive health within 14 days...", height=120)
            
            col_tier, col_study = st.columns(2)
            with col_tier:
                target_tier = st.selectbox("Target Claim Tier", ["T2 (Substantiated)", "T3 (Qualified)"])
            with col_study:
                selected_study_title = st.selectbox("Link Supporting Clinical Study (Optional)", ["None"] + list(evidence_options.keys()))
            
            st.markdown("<br>", unsafe_allow_html=True)
            submit_btn = st.form_submit_button("Submit to Legal Queue", type="primary", use_container_width=True)
            
            if submit_btn:
                if not proposed_claim:
                    st.warning("Please enter proposed claim text.")
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
                    st.success("✅ Claim submitted successfully! Legal has been notified.")
                    st.rerun()


# ==============================================================================
# LEGAL & COMPLIANCE VIEW (Full Dashboard Access)
# ==============================================================================
elif st.session_state.user_role == "Legal & Compliance":
    st.title("🛡️ Compliance Control Center")
    st.markdown("Manage clinical evidence, approve marketing claims, and audit master records.")
    st.markdown("---")

    tab_evidence, tab_pipeline, tab_claims = st.tabs(["🔬 Evidence Catalog", "⚖️ Review Queue", "📋 Master Claims"])

    # --------------------------------------------------------------------------
    # TAB 1: EVIDENCE CATALOG
    # --------------------------------------------------------------------------
    with tab_evidence:
        col_search, col_upload = st.columns([3, 1])
        with col_search:
            search_query = st.text_input("🔍 Search catalog by keyword, title, or findings...", placeholder="Search...")
        
        with st.expander("➕ Upload New Study Document", expanded=False):
            with st.form("add_study_form", clear_on_submit=True):
                study_title = st.text_input("Study Title", placeholder="e.g., Clinical Trial #305 - Gut Motility")
                col_type, col_added = st.columns(2)
                with col_type:
                    evidence_type = st.selectbox("Evidence Type", ["Clinical Trial", "Literature Review", "Lab Assay", "Other"])
                with col_added:
                    added_by = st.text_input("Uploader", value=st.session_state.user.email, disabled=True)
                    
                study_desc = st.text_area("Executive Summary / Findings")
                uploaded_file = st.file_uploader("Upload Source Document", type=["pdf", "md", "txt"])
                
                save_study = st.form_submit_button("Extract & Publish", type="primary")
                
                if save_study:
                    if not study_title or not uploaded_file:
                        st.warning("Title and Document File are required.")
                    else:
                        extracted_text = ""
                        if uploaded_file.name.lower().endswith(".pdf"):
                            try:
                                pdf_reader = PyPDF2.PdfReader(uploaded_file)
                                for page in pdf_reader.pages:
                                    ext = page.extract_text()
                                    if ext: extracted_text += ext + "\n\n"
                            except Exception as e:
                                st.error(f"Failed to parse PDF: {e}")
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
                            st.success("Study processed and added to catalog!")
                            st.rerun()
                            
        st.divider()
        
        try:
            evidence_resp = supabase.table("evidence").select("*").order("created_at", desc=True).execute()
            evidence_data = evidence_resp.data
            
            if evidence_data:
                if search_query:
                    q = search_query.lower()
                    evidence_data = [e for e in evidence_data if q in str(e.get('title', '')).lower() or q in str(e.get('description', '')).lower()]
                
                st.caption(f"Showing **{len(evidence_data)}** clinical evidence records.")
                
                for study in evidence_data:
                    status_icon = "🟢" if study.get('status') == 'Active' else "⚪"
                    with st.expander(f"{status_icon} {study.get('title', 'Untitled Study')}"):
                        
                        # UI Polished Badges
                        stat_class = "active" if study.get('status') == 'Active' else "outdated"
                        badges_html = f"""
                            {render_badge(study.get('status', 'Active').upper(), stat_class)}
                            {render_badge(study.get('evidence_type', 'N/A'), 'outdated')}
                        """
                        st.markdown(badges_html, unsafe_allow_html=True)
                        st.caption(f"**Uploader:** {study.get('added_by', 'N/A')}")
                        
                        st.write(f"**Summary:** {study.get('description', 'No summary provided.')}")
                        
                        try:
                            approved_claims = supabase.table("claims").select("*").eq("evidence_id", study['id']).eq("status", "Approved").execute()
                            pending_claims = supabase.table("claim_submissions").select("*").eq("evidence_id", study['id']).eq("human_status", "Pending Review").execute()
                            
                            if approved_claims.data or pending_claims.data:
                                st.markdown("---")
                                st.markdown("##### 🔗 Linked Claims")
                                
                                for c in approved_claims.data:
                                    tier = str(c.get('tier', 'T3')).lower().replace(" ", "")
                                    t_class = tier if tier in ['t1', 't2', 't3'] else 'active'
                                    st.markdown(f"{render_badge(c.get('tier', 'T3'), t_class)} {c.get('claim_text', '')}", unsafe_allow_html=True)
                                    
                                for pc in pending_claims.data:
                                    st.markdown(f"{render_badge('PENDING REVIEW', 'pending')} {pc.get('proposed_claim', '')}", unsafe_allow_html=True)
                            else:
                                st.markdown("---")
                                st.caption("*No marketing claims currently linked.*")
                        except Exception:
                            st.caption("⚠️ *Database linking error.*")
                        
                        if study.get("study_content"):
                            st.markdown("---")
                            st.markdown("##### 📄 Extracted Content")
                            with st.container(height=250):
                                st.markdown(study["study_content"])
                            
                        if study.get('status') == 'Active':
                            st.markdown("<br>", unsafe_allow_html=True)
                            col1, col2, col_btn = st.columns([2,2,1])
                            with col_btn:
                                if st.button("🗄️ Mark Outdated", key=f"outdate_{study['id']}", use_container_width=True):
                                    supabase.table("evidence").update({"status": "Outdated"}).eq("id", study['id']).execute()
                                    st.rerun()
                                    
            else:
                st.info("Your evidence catalog is empty.")
        except Exception as e:
            st.error(f"Error loading evidence: {e}")

    # --------------------------------------------------------------------------
    # TAB 2: CLAIMS REVIEW QUEUE
    # --------------------------------------------------------------------------
    with tab_pipeline:
        try:
            pending_resp = supabase.table("claim_submissions").select("*").eq("human_status", "Pending Review").order("created_at", desc=False).execute()
            pending_claims = pending_resp.data
            
            if not pending_claims:
                st.success("🎉 Inbox Zero! No claims currently await review.")
            else:
                st.caption(f"**{len(pending_claims)}** claims awaiting legal approval.")
                st.markdown("###")
                
                for claim in pending_claims:
                    with st.expander(f"⏳ Pending: {claim['proposed_claim'][:50]}...", expanded=True):
                        
                        tier = claim.get('target_tier', 'T3')
                        t_class = tier.lower() if tier.lower() in ['t1', 't2', 't3'] else 'pending'
                        
                        st.markdown(f"##### Proposed Claim\n> {claim['proposed_claim']}")
                        st.markdown(f"{render_badge('TARGET: ' + tier, t_class)} **Author:** {claim['submitted_by']}", unsafe_allow_html=True)
                        
                        if claim.get("evidence_id"):
                            try:
                                ev_info = supabase.table("evidence").select("title").eq("id", claim["evidence_id"]).single().execute()
                                if ev_info.data:
                                    st.markdown(f"**Supporting Study:** 📄 `{ev_info.data['title']}`")
                            except Exception:
                                pass
                        
                        st.markdown("<br>", unsafe_allow_html=True)
                        col_app, col_rej, _ = st.columns([1, 1, 2])
                        with col_app:
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
                                
                        with col_rej:
                            if st.button("❌ Reject", key=f"rej_{claim['id']}", type="secondary", use_container_width=True):
                                supabase.table("claim_submissions").update({"human_status": "Rejected"}).eq("id", claim['id']).execute()
                                st.rerun()
        except Exception as e:
            st.error(f"Error fetching queue: {e}")

    # --------------------------------------------------------------------------
    # TAB 3: MASTER CLAIMS BANK
    # --------------------------------------------------------------------------
    with tab_claims:
        col_c_search, _ = st.columns([2, 1])
        with col_c_search:
            claims_search = st.text_input("🔍 Search active master claims...", placeholder="Search...")
        st.divider()
        
        try:
            evidence_dict = {"None": None}
            ev_query = supabase.table("evidence").select("id, title").execute()
            if ev_query.data:
                for e in ev_query.data:
                    evidence_dict[e['title']] = e['id']
                    
            claims_resp = supabase.table("claims").select("*").order("created_at", desc=True).execute()
            claims_data = claims_resp.data
            
            if not claims_data:
                st.info("No claims established in the Master Bank.")
            else:
                if claims_search:
                    q = claims_search.lower()
                    claims_data = [c for c in claims_data if q in str(c.get('claim_text', '')).lower()]
                
                for c in claims_data:
                    current_status = c.get('status', 'Approved')
                    icon = "✅" if current_status == "Approved" else "🚫"
                    
                    with st.expander(f"{icon} [{c.get('tier', 'T3')}] {c.get('claim_text', 'Untitled')[:60]}..."):
                        
                        st.markdown("##### Edit Claim Details")
                        updated_text = st.text_area("Master Claim Copy", value=c.get('claim_text', ''), key=f"text_{c['id']}", height=80)
                        
                        current_ev_id = c.get('evidence_id')
                        current_ev_title = "None"
                        if current_ev_id:
                            for title, eid in evidence_dict.items():
                                if eid == current_ev_id:
                                    current_ev_title = title
                                    break
                        
                        new_ev_title = st.selectbox(
                            "Supporting Evidence Link", 
                            list(evidence_dict.keys()), 
                            index=list(evidence_dict.keys()).index(current_ev_title) if current_ev_title in evidence_dict else 0,
                            key=f"ev_select_{c['id']}"
                        )
                        
                        col_tier, col_status = st.columns(2)
                        with col_tier:
                            tier_options = ["T1 (Primary)", "T2 (Substantiated)", "T3 (Qualified)"]
                            current_tier = c.get('tier', 'T3')
                            idx = 0
                            for i, opt in enumerate(tier_options):
                                if current_tier[:2] in opt: idx = i
                            new_tier = st.selectbox("Regulatory Tier", tier_options, index=idx, key=f"tier_{c['id']}")
                            
                        with col_status:
                            status_options = ["Approved", "Revoked"]
                            s_idx = 0 if current_status == "Approved" else 1
                            new_status = st.selectbox("Compliance Status", status_options, index=s_idx, key=f"status_{c['id']}")
                            
                        st.markdown("<br>", unsafe_allow_html=True)
                        if st.button("💾 Commit Changes", key=f"save_claim_{c['id']}", type="primary"):
                            supabase.table("claims").update({
                                "claim_text": updated_text,
                                "tier": new_tier.split()[0], 
                                "status": new_status,
                                "evidence_id": evidence_dict[new_ev_title]
                            }).eq("id", c['id']).execute()
                            
                            st.toast("Claim updated securely!")
                            st.rerun()
                            
        except Exception as e:
            st.error(f"Error fetching claims bank: {e}")
