import streamlit as st
from supabase import create_client

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
                # Authenticate with Supabase Auth
                auth_resp = supabase.auth.sign_in_with_password({"email": email, "password": password})
                st.session_state.user = auth_resp.user
                
                # Try to fetch role from a 'profiles' table, default to Legal for demo if none found
                try:
                    profile = supabase.table("profiles").select("role").eq("id", auth_resp.user.id).single().execute()
                    st.session_state.user_role = profile.data.get("role", "Marketing")
                except:
                    # Fallback if you haven't created a profiles table yet
                    st.session_state.user_role = "Legal & Compliance" if "legal" in email.lower() else "Marketing Team"
                
                st.rerun()
           except Exception as e:
                st.error(f"Login failed. Error details: {e}")
    
    st.warning("👈 Please log in using the sidebar to access the portal.")
    st.stop() # Halts the app from rendering the rest until logged in

# Logged-in Sidebar View
sidebar.success(f"Logged in as:\n**{st.session_state.user.email}**")
sidebar.caption(f"Role: **{st.session_state.user_role}**")
if sidebar.button("Log Out", use_container_width=True):
    supabase.auth.sign_out()
    st.session_state.user = None
    st.session_state.user_role = None
    st.rerun()


# ==========================================
# MAIN DASHBOARD
# ==========================================
st.title("🛡️ Corporate Claims & Evidence Catalog")
st.caption("Centralized Repository for Clinical Studies, Tier Claims, and Marketing Approvals")
st.markdown("---")

tab_evidence, tab_pipeline = st.tabs(["🔬 Evidence Catalog", "📋 Claims Submission & Review"])

# ==============================================================================
# TAB 1: EVIDENCE CATALOG
# ==============================================================================
with tab_evidence:
    st.subheader("Approved Clinical Evidence & Studies")
    st.write("Reference database of scientific trials, active statuses, and linked claim tiers.")
    
    # 1. LEGAL UPLOAD FORM (Restricted to Legal)
    if st.session_state.user_role == "Legal & Compliance":
        with st.expander("➕ Upload New Clinical Study (Markdown)", expanded=False):
            with st.form("add_study_form", clear_on_submit=True):
                study_title = st.text_input("Study Title", placeholder="e.g., Clinical Trial #305 - Gut Motility Study")
                study_desc = st.text_area("Findings / Description Summary")
                uploaded_file = st.file_uploader("Upload Study Document (.md or .txt)", type=["md", "txt"])
                
                save_study = st.form_submit_button("Publish to Catalog", type="primary")
                
                if save_study:
                    if not study_title or not uploaded_file:
                        st.warning("Please provide both a title and a document file.")
                    else:
                        # Extract the text from the file
                        markdown_content = uploaded_file.getvalue().decode("utf-8")
                        
                        # Save straight to Postgres Database
                        supabase.table("evidence").insert({
                            "title": study_title,
                            "description": study_desc,
                            "study_content": markdown_content,
                            "status": "Active"
                        }).execute()
                        st.success("Study successfully saved directly to the database!")
                        st.rerun()
                        
    st.markdown("###")
    
    # 2. VIEW EVIDENCE CATALOG
    try:
        # Fetching records including our new study_content column
        evidence_resp = supabase.table("evidence").select("id, title, description, study_content, status, created_at").execute()
        evidence_data = evidence_resp.data
        
        if evidence_data:
            col_m1, col_m2 = st.columns(2)
            col_m1.metric("Total Studies Logged", len(evidence_data))
            col_m2.metric("Active Clinical Studies", sum(1 for e in evidence_data if e.get('status') == 'Active'))
            
            st.divider()
            
            # Display studies in expanders so users can read the Markdown natively
            for study in evidence_data:
                with st.expander(f"📄 {study['title']} ({study['status']})"):
                    st.write(f"**Summary:** {study['description']}")
                    st.caption(f"Logged on: {study['created_at'][:10]}")
                    
                    if study.get("study_content"):
                        st.markdown("---")
                        # Renders the markdown cleanly right in the app
                        st.markdown(study["study_content"]) 
                    else:
                        st.info("No full document text attached to this record.")
        else:
            st.info("No clinical evidence records found.")
    except Exception as e:
        st.error(f"Error fetching evidence data: {e}")

# ==============================================================================
# TAB 2: CLAIMS PIPELINE & REVIEW QUEUE
# ==============================================================================
with tab_pipeline:
    col_submit, col_queue = st.columns([1, 1], gap="large")
    
    # LEFT: Marketing Submission Form
    with col_submit:
        with st.container(border=True):
            st.subheader("📝 Submit New Marketing Claim")
            st.caption("Enter proposed copy for Legal review against existing evidence.")
            
            with st.form("marketing_claim_form", clear_on_submit=True):
                proposed_claim = st.text_area("Proposed Claim Copy", placeholder="e.g., Proven to increase digestive health within 14 days.")
                target_tier = st.selectbox("Target Claim Tier", ["T2 (Substantiated)", "T3 (Qualified)"])
                
                submit_btn = st.form_submit_button("Submit for Legal Review", type="primary", use_container_width=True)
                
                if submit_btn:
                    if not proposed_claim:
                        st.warning("Please enter a proposed claim.")
                    else:
                        payload = {
                            "proposed_claim": proposed_claim,
                            "target_tier": target_tier.split()[0], # Extracts "T2" or "T3"
                            "submitted_by": st.session_state.user.email, # Auto-captures logged in user
                            "human_status": "Pending Review"
                        }
                        supabase.table("claim_submissions").insert(payload).execute()
                        st.success("Claim submitted successfully to the Legal Queue!")
                        st.rerun()

    # RIGHT: Legal Queue
    with col_queue:
        with st.container(border=True):
            st.subheader("⚖️ Legal Review Queue")
            
            pending_resp = supabase.table("claim_submissions").select("*").eq("human_status", "Pending Review").execute()
            pending_claims = pending_resp.data
            
            if not pending_claims:
                st.success("🎉 All clear! No pending claims requiring review.")
            else:
                st.caption(f"**{len(pending_claims)}** claims awaiting approval.")
                
                for claim in pending_claims:
                    with st.expander(f"📌 {claim['proposed_claim'][:40]}...", expanded=True):
                        st.write(f"**Full Claim:** {claim['proposed_claim']}")
                        st.write(f"**Tier:** `{claim['target_tier']}` | **By:** {claim['submitted_by']}")
                        
                        if claim.get("ai_evaluation"):
                            st.info(f"**🤖 AI Pre-Check:** {claim['ai_evaluation']}")
                            
                        # Restricted Approval Actions
                        if st.session_state.user_role == "Legal & Compliance":
                            col_app, col_rej = st.columns(2)
                            with col_app:
                                if st.button("✅ Approve", key=f"app_{claim['id']}", use_container_width=True):
                                    supabase.table("claim_submissions").update({"human_status": "Approved"}).eq("id", claim['id']).execute()
                                    st.toast("Claim Approved!")
                                    st.rerun()
                            with col_rej:
                                if st.button("❌ Reject", key=f"rej_{claim['id']}", use_container_width=True):
                                    supabase.table("claim_submissions").update({"human_status": "Rejected"}).eq("id", claim['id']).execute()
                                    st.toast("Claim Rejected!")
                                    st.rerun()
                        else:
                            st.caption("🔒 *Only Legal & Compliance can approve or reject claims.*")
