import streamlit as st
from supabase import create_client

# Page Config: Executive Wide Layout
st.set_page_config(
    page_title="Corporate Claims & Compliance Portal",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling for Card Containers
st.markdown("""
    <style>
    .stApp { background-color: #f8fafc; }
    div[data-testid="stMetric"] {
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        padding: 15px;
        border-radius: 8px;
    }
    </style>
""", unsafe_allow_html=True)

# 1. Initialize Supabase Connection
@st.cache_resource
def init_supabase():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_supabase()

# 2. Sidebar Navigation & Access Control
st.sidebar.image("https://img.icons8.com/color/96/shield.png", width=60)
st.sidebar.title("Compliance Hub")
st.sidebar.markdown("---")

role = st.sidebar.radio("Active Workspace Role", ["Marketing Team", "Legal & Compliance"])
st.sidebar.caption(f"Logged in view: **{role}**")

# 3. Header Banner
st.title("🛡️ Corporate Claims & Evidence Catalog")
st.caption("Centralized Repository for Clinical Studies, Tier Claims, and Marketing Approvals")
st.markdown("---")

# 4. Main Navigation Tabs
tab_evidence, tab_pipeline = st.tabs(["🔬 Evidence Catalog", "📋 Claims Submission & Review"])

# ==============================================================================
# TAB 1: EVIDENCE CATALOG
# ==============================================================================
with tab_evidence:
    st.subheader("Approved Clinical Evidence & Studies")
    st.write("Reference database of scientific trials, active statuses, and linked claim tiers.")
    
    try:
        evidence_resp = supabase.table("evidence").select("id, title, description, status, created_at").execute()
        evidence_data = evidence_resp.data
        
        if evidence_data:
            # Metrics Overview
            col_m1, col_m2 = st.columns(2)
            active_count = sum(1 for e in evidence_data if e.get('status') == 'Active')
            col_m1.metric("Total Studies Logged", len(evidence_data))
            col_m2.metric("Active Clinical Studies", active_count)
            
            st.markdown("###")
            # Render interactive table, hiding technical internal IDs
            st.dataframe(
                evidence_data,
                column_config={
                    "id": None, # Hides UUID column
                    "title": st.column_config.TextColumn("Study Title", width="large"),
                    "description": st.column_config.TextColumn("Clinical Findings / Summary", width="large"),
                    "status": st.column_config.SelectboxColumn("Status", options=["Active", "Archived"]),
                    "created_at": st.column_config.DatetimeColumn("Date Logged", format="D MMM YYYY")
                },
                use_container_width=True,
                hide_index=True
            )
        else:
            st.info("No clinical evidence records found in Supabase.")
    except Exception as e:
        st.error(f"Error fetching evidence data: {e}")

# ==============================================================================
# TAB 2: CLAIMS PIPELINE & REVIEW QUEUE
# ==============================================================================
with tab_pipeline:
    col_submit, col_queue = st.columns([1, 1], gap="large")
    
    # Left Column: Marketing Submission Form
    with col_submit:
        with st.container(border=True):
            st.subheader("📝 Submit New Marketing Claim")
            st.caption("Enter proposed copy for Legal review against existing evidence.")
            
            with st.form("marketing_claim_form", clear_on_submit=True):
                proposed_claim = st.text_area("Proposed Claim Copy", placeholder="e.g., Proven to increase digestive health within 14 days.")
                target_tier = st.selectbox("Target Claim Tier", ["T2 (Substantiated)", "T3 (Qualified)"])
                submitted_by = st.text_input("Submitted By (Email / Name)", placeholder="jane.doe@company.com")
                
                submit_btn = st.form_submit_button("Submit for Legal Review", type="primary", use_container_width=True)
                
                if submit_btn:
                    if not proposed_claim or not submitted_by:
                        st.warning("Please fill out all required fields before submitting.")
                    else:
                        payload = {
                            "proposed_claim": proposed_claim,
                            "target_tier": target_tier.split()[0], # Extracts "T2" or "T3"
                            "submitted_by": submitted_by,
                            "human_status": "Pending Review"
                        }
                        supabase.table("claim_submissions").insert(payload).execute()
                        st.success("Claim submitted successfully to the Legal Queue!")
                        st.rerun()

    # Right Column: Legal Queue (Visible to all, but actions restricted to Legal)
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
                    with st.expander(f"📌 {claim['proposed_claim'][:50]}...", expanded=True):
                        st.write(f"**Full Claim:** {claim['proposed_claim']}")
                        st.write(f"**Target Tier:** `{claim['target_tier']}` | **Submitted By:** {claim['submitted_by']}")
                        
                        if claim.get("ai_evaluation"):
                            st.info(f"**AI Pre-Check:** {claim['ai_evaluation']}")
                            
                        # Restricted Actions
                        if role == "Legal & Compliance":
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
                            st.caption("🔒 *Switch sidebar role to 'Legal & Compliance' to approve or reject items.*")
