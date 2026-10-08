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

st.markdown("""
    <style>
    .stApp { background-color: #f8fafc; }
    div[data-testid="stMetric"] { background-color: #ffffff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; }
    </style>
""", unsafe_allow_html=True)

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
sidebar.image("https://img.icons8.com/color/96/shield.png", width=60)
sidebar.title("Compliance Hub")
sidebar.markdown("---")

if not st.session_state.user:
    with sidebar.form("login_form"):
        st.subheader("🔒 User Login")
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        login_btn = st.form_submit_button("Log In")
        
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
                st.error(f"Login failed. Error details: {e}")
    
    st.warning("👈 Please log in using the sidebar to access the portal.")
    st.stop()

# Logged-in Sidebar Navigation
sidebar.success(f"Logged in as:\n**{st.session_state.user.email}**")
sidebar.caption(f"Role: **{st.session_state.user_role}**")
if sidebar.button("Log Out", use_container_width=True):
    supabase.auth.sign_out()
    st.session_state.user = None
    st.session_state.user_role = None
    st.rerun()


# ==============================================================================
# MARKETING VIEW (Restricted to Claims Submissions)
# ==============================================================================
if st.session_state.user_role == "Marketing Team":
    st.title("📝 Submit New Marketing Claim")
    st.caption("Enter proposed copy for Legal review against existing clinical evidence.")
    st.markdown("---")
    
    # Fetch ONLY active evidence so marketing cannot link outdated studies
    evidence_options = {}
    try:
        ev_resp = supabase.table("evidence").select("id, title").eq("status", "Active").execute()
        if ev_resp.data:
            evidence_options = {e['title']: e['id'] for e in ev_resp.data}
    except Exception:
        pass

    with st.container(border=True):
        with st.form("marketing_claim_form", clear_on_submit=True):
            proposed_claim = st.text_area("Proposed Claim Copy", placeholder="e.g., Proven to increase digestive health within 14 days.")
            
            col_tier, col_study = st.columns(2)
            with col_tier:
                target_tier = st.selectbox("Target Claim Tier", ["T2 (Substantiated)", "T3 (Qualified)"])
            with col_study:
                selected_study_title = st.selectbox("Link Supporting Evidence Study (Optional)", ["None"] + list(evidence_options.keys()))
            
            submit_btn = st.form_submit_button("Submit for Legal Review", type="primary", use_container_width=True)
            
            if submit_btn:
                if not proposed_claim:
                    st.warning("Please enter a proposed claim.")
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
                    st.success("Claim submitted successfully to the Legal Queue!")
                    st.rerun()


# ==============================================================================
# LEGAL & COMPLIANCE VIEW (Full Dashboard Access)
# ==============================================================================
elif st.session_state.user_role == "Legal & Compliance":
    st.title("🛡️ Legal Compliance Dashboard")
    st.markdown("---")

    tab_evidence, tab_pipeline = st.tabs(["🔬 Evidence Catalog", "⚖️ Claims Review Queue"])

    # --------------------------------------------------------------------------
    # TAB 1: EVIDENCE CATALOG
    # --------------------------------------------------------------------------
    with tab_evidence:
        st.subheader("Clinical Evidence & Studies")
        
        # 🔍 Keyword Search Bar
        search_query = st.text_input("🔍 Search evidence by keyword, title, or description...", "")
        
        # --- 1. LEGAL UPLOAD FORM ---
        with st.expander("➕ Upload New Clinical Study (PDF, MD, or Text)", expanded=False):
            with st.form("add_study_form", clear_on_submit=True):
                study_title = st.text_input("Study Title", placeholder="e.g., Clinical Trial #305 - Gut Motility")
                
                col_type, col_added = st.columns(2)
                with col_type:
                    evidence_type = st.selectbox("Evidence Type", ["Clinical Trial", "Literature Review", "Lab Assay", "Other"])
                with col_added:
                    added_by = st.text_input("Added By", value=st.session_state.user.email)
                    
                study_desc = st.text_area("Findings / Description Summary")
                uploaded_file = st.file_uploader("Upload Study Document", type=["pdf", "md", "txt"])
                
                save_study = st.form_submit_button("Publish to Catalog", type="primary")
                
                if save_study:
                    if not study_title or not uploaded_file:
                        st.warning("Please provide both a title and a document file.")
                    else:
                        extracted_text = ""
                        
                        # Handle PDF Extraction
                        if uploaded_file.name.lower().endswith(".pdf"):
                            try:
                                pdf_reader = PyPDF2.PdfReader(uploaded_file)
                                for page in pdf_reader.pages:
                                    extracted_page = page.extract_text()
                                    if extracted_page:
                                        extracted_text += extracted_page + "\n\n"
                            except Exception as e:
                                st.error(f"Failed to extract PDF text: {e}")
                        # Handle standard Text / Markdown files
                        else:
                            extracted_text = uploaded_file.getvalue().decode("utf-8")
                        
                        if extracted_text:
                            supabase.table("evidence").insert({
                                "title": study_title,
                                "evidence_type": evidence_type,
                                "added_by": added_by,
                                "description": study_desc,
                                "study_content": extracted_text,
                                "status": "Active"
                            }).execute()
                            st.success("Study parsed and published to database!")
                            st.rerun()
                            
        st.markdown("###")
        
        # --- 2. VIEW CATALOG WITH SEARCH, VISUAL LINKS, AND SOFT DELETE ---
        try:
            # Fetch records
            evidence_resp = supabase.table("evidence").select("*").order("created_at", desc=True).execute()
            evidence_data = evidence_resp.data
            
            if evidence_data:
                # Filter by search query
                if search_query:
                    q = search_query.lower()
                    evidence_data = [
                        e for e in evidence_data 
                        if q in str(e.get('title', '')).lower() 
                        or q in str(e.get('description', '')).lower()
                    ]
                
                st.caption(f"Showing **{len(evidence_data)}** clinical evidence records.")
                st.divider()
                
                for study in evidence_data:
                    with st.expander(f"📄 {study.get('title', 'Untitled Study')} ({study.get('status', 'Active')})"):
                        col1, col2 = st.columns(2)
                        col1.write(f"**Type:** {study.get('evidence_type', 'N/A')}")
                        col2.write(f"**Added By:** {study.get('added_by', 'N/A')}")
                        
                        st.write(f"**Summary:** {study.get('description', '')}")
                        
                        # 🔗 SAFELY Fetch Linked Claims (Won't crash if database structure is mismatched)
                        try:
                            approved_claims = supabase.table("claims").select("*").eq("evidence_id", study['id']).execute()
                            pending_claims = supabase.table("claim_submissions").select("*").eq("evidence_id", study['id']).eq("human_status", "Pending Review").execute()
                            
                            if approved_claims.data or pending_claims.data:
                                st.markdown("---")
                                st.write("🔗 **Tied Claims:**")
                                
                                for c in approved_claims.data:
                                    tier = c.get('tier') or c.get('target_tier') or 'Claim'
                                    claim_text = c.get('claim_text') or c.get('claim') or c.get('proposed_claim', '')
                                    st.caption(f"✅ **[{tier}] Approved Master Claim:** {claim_text}")
                                    
                                for pc in pending_claims.data:
                                    tier = pc.get('target_tier', 'Claim')
                                    st.caption(f"⏳ **[{tier}] Pending Review Submission:** {pc.get('proposed_claim', '')}")
                            else:
                                st.markdown("---")
                                st.caption("🔗 *No claims currently tied to this study.*")
                        except Exception:
                            st.markdown("---")
                            st.caption(f"⚠️ *Could not load linked claims. (Database check needed).*")
                        
                        if study.get("study_content"):
                            st.markdown("---")
                            st.markdown(study["study_content"])
                            
                        # 🗄️ Soft Delete / Archive Button
                        if study.get('status') == 'Active':
                            st.markdown("---")
                            col_space, col_del = st.columns([4, 1])
                            with col_del:
                                if st.button("🗄️ Mark as Outdated", key=f"outdate_{study['id']}", type="secondary", use_container_width=True):
                                    supabase.table("evidence").update({"status": "Outdated"}).eq("id", study['id']).execute()
                                    st.toast("Study filed as Outdated!")
                                    st.rerun()
                                    
            else:
                st.info("No clinical evidence records found.")
        except Exception as e:
            st.error(f"Error fetching evidence data: {e}")

    # --------------------------------------------------------------------------
    # TAB 2: CLAIMS REVIEW QUEUE
    # --------------------------------------------------------------------------
    with tab_pipeline:
        st.subheader("⚖️ Pending Claims Review")
        
        pending_resp = supabase.table("claim_submissions").select("*").eq("human_status", "Pending Review").execute()
        pending_claims = pending_resp.data
        
        if not pending_claims:
            st.success("🎉 All clear! No pending claims requiring review.")
        else:
            st.caption(f"**{len(pending_claims)}** claims awaiting approval.")
            
            for claim in pending_claims:
                with st.expander(f"📌 {claim['proposed_claim'][:60]}...", expanded=True):
                    st.write(f"**Full Proposed Claim:** {claim['proposed_claim']}")
                    st.write(f"**Target Tier:** `{claim['target_tier']}` | **Submitted By:** {claim['submitted_by']}")
                    
                    if claim.get("evidence_id"):
                        try:
                            ev_info = supabase.table("evidence").select("title").eq("id", claim["evidence_id"]).single().execute()
                            if ev_info.data:
                                st.write(f"**Linked Evidence Study:** 📄 {ev_info.data['title']}")
                        except Exception:
                            pass
                    
                    if claim.get("ai_evaluation"):
                        st.info(f"**🤖 AI Pre-Check:** {claim['ai_evaluation']}")
                        
                    col_app, col_rej = st.columns(2)
                    with col_app:
                        if st.button("✅ Approve", key=f"app_{claim['id']}", use_container_width=True):
                            # 1. Update review status
                            supabase.table("claim_submissions").update({"human_status": "Approved"}).eq("id", claim['id']).execute()
                            
                            # 2. Promote into Master 'claims' Bank safely
                            try:
                                supabase
