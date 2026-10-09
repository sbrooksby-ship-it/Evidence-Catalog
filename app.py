import streamlit as st
from supabase import create_client
import PyPDF2
import pandas as pd
import base64

# ==========================================
# PAGE CONFIG & ENHANCED DESIGN SYSTEM
# ==========================================
st.set_page_config(
    page_title="Corporate Claims & Compliance Portal",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    html, body, .stApp { background-color: #F8FAFC; font-family: 'Inter', sans-serif; color: #0F172A; }
    
    .header-container { background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%); padding: 24px 32px; border-radius: 12px; color: white; margin-bottom: 24px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.08); }
    .header-title { font-size: 1.75rem; font-weight: 700; margin: 0; color: #FFFFFF; }
    .header-subtitle { color: #94A3B8; font-size: 0.95rem; margin-top: 4px; }
    
    div[data-testid="stMetric"] { background-color: #FFFFFF; border: 1px solid #E2E8F0; padding: 16px 20px; border-radius: 10px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05); }
    div[data-testid="stMetricLabel"] { font-size: 0.85rem; font-weight: 600; color: #64748B; }
    div[data-testid="stMetricValue"] { font-size: 1.8rem; font-weight: 700; color: #0F172A; }
    
    div[data-testid="stExpander"] { background-color: #FFFFFF; border-radius: 10px; border: 1px solid #E2E8F0 !important; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04); margin-bottom: 12px; }
    div[data-testid="stExpander"] > details > summary { font-weight: 600; font-size: 1.02rem; padding: 14px 18px; }

    .badge { display: inline-block; padding: 4px 12px; font-size: 0.75rem; font-weight: 700; border-radius: 6px; margin-right: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-t1 { background-color: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
    .badge-t2 { background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
    .badge-t3 { background-color: #FDF2F8; color: #BE185D; border: 1px solid #FBCFE8; }
    .badge-active { background-color: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0; }
    .badge-outdated { background-color: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; }
    .badge-pending { background-color: #FEFCE8; color: #A16207; border: 1px solid #FEF08A; }
    .badge-revoked { background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; }
    .badge-risk { background-color: #FEF2F2; color: #991B1B; border: 1px solid #F87171; }
    </style>
""", unsafe_allow_html=True)

def render_badge(text, badge_type):
    return f'<span class="badge badge-{badge_type}">{text}</span>'

# ==========================================
# DATABASE & AUTHENTICATION
# ==========================================
@st.cache_resource
def init_supabase():
    return create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_KEY"])

supabase = init_supabase()

if "user" not in st.session_state: st.session_state.user = None
if "user_role" not in st.session_state: st.session_state.user_role = None

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
        if st.form_submit_button("Log In", use_container_width=True):
            try:
                auth_resp = supabase.auth.sign_in_with_password({"email": email, "password": password})
                st.session_state.user = auth_resp.user
                st.session_state.user_role = "Legal & Compliance" if "legal" in (auth_resp.user.email or "").lower() else "Marketing Team"
                st.rerun()
            except Exception:
                st.error("Invalid credentials.")
    st.stop()

with sidebar:
    st.markdown(f"👤 **User:** `{st.session_state.user.email}`")
    st.markdown(f"🏷️ **Role:** `{st.session_state.user_role}`")
    st.markdown("---")
    if st.button("Log Out", use_container_width=True):
        supabase.auth.sign_out()
        st.session_state.user, st.session_state.user_role = None, None
        st.rerun()

# ==========================================
# MODAL DIALOGS
# ==========================================
@st.dialog("➕ Upload New Clinical Document", width="large")
def upload_evidence_modal():
    st.caption("Upload files. The first PDF will be saved for visual viewing; all text will be extracted.")
    with st.form("add_study_form", clear_on_submit=True):
        study_title = st.text_input("Study Title", placeholder="e.g., Clinical Trial #402")
        evidence_type = st.selectbox("Type", ["Clinical Trial", "Literature Review", "Lab Assay", "Other"])
        study_desc = st.text_area("Findings Summary", height=100)
        uploaded_files = st.file_uploader("Source Files", type=["pdf", "md", "txt"], accept_multiple_files=True)
        
        if st.form_submit_button("Extract & Publish", type="primary", use_container_width=True):
            if not study_title or not uploaded_files:
                st.warning("Title and at least one file are required.")
            else:
                extracted_text = ""
                primary_pdf_b64 = None
                
                with st.spinner("Extracting text and processing documents..."):
                    for i, file in enumerate(uploaded_files):
                        extracted_text += f"\n\n--- Appended File: {file.name} ---\n\n"
                        if file.name.lower().endswith(".pdf"):
                            file_bytes = file.getvalue()
                            if primary_pdf_b64 is None:
                                primary_pdf_b64 = base64.b64encode(file_bytes).decode('utf-8')
                            try:
                                pdf_reader = PyPDF2.PdfReader(file)
                                for page in pdf_reader.pages:
                                    txt = page.extract_text()
                                    if txt: extracted_text += txt + "\n\n"
                            except Exception as e:
                                st.error(f"PDF error on {file.name}: {e}")
                        else:
                            extracted_text += file.getvalue().decode("utf-8")
                    
                    if extracted_text.strip():
                        supabase.table("evidence").insert({
                            "title": study_title,
                            "evidence_type": evidence_type,
                            "added_by": st.session_state.user.email,
                            "description": study_desc,
                            "study_content": extracted_text,
                            "primary_document_base64": primary_pdf_b64,
                            "status": "Active"
                        }).execute()
                        st.success("Study published!")
                        st.rerun()

@st.dialog("📄 Original Document & Extracted Text", width="large")
def view_study_modal(study_title, study_content, pdf_b64):
    st.subheader(study_title)
    if pdf_b64:
        tab_pdf, tab_text = st.tabs(["🖼️ Original PDF", "📝 Extracted AI Text"])
        with tab_pdf:
            st.markdown(f'<iframe src="data:application/pdf;base64,{pdf_b64}" width="100%" height="700px" type="application/pdf"></iframe>', unsafe_allow_html=True)
        with tab_text:
            st.markdown(study_content)
    else:
        if study_content: st.markdown(study_content)
        else: st.info("No data available.")

@st.dialog("✏️ Edit Master Claim")
def edit_claim_modal(claim_data, evidence_dict):
    updated_text = st.text_area("Master Claim Copy", value=claim_data.get('claim_text', ''), height=120)
    current_ev_id = claim_data.get('evidence_id')
    current_ev_title = next((t for t, eid in evidence_dict.items() if eid == current_ev_id), "None")
    new_ev_title = st.selectbox("Linked Clinical Study", list(evidence_dict.keys()), index=list(evidence_dict.keys()).index(current_ev_title) if current_ev_title in evidence_dict else 0)
    
    col_t, col_s = st.columns(2)
    with col_t:
        tier_opts = ["T1 (Primary)", "T2 (Substantiated)", "T3 (Qualified)"]
        curr_t = claim_data.get('tier', 'T3')
        new_tier = st.selectbox("Regulatory Tier", tier_opts, index=next((i for i, opt in enumerate(tier_opts) if curr_t[:2] in opt), 0))
    with col_s:
        new_status = st.selectbox("Status", ["Approved", "Revoked"], index=0 if claim_data.get('status', 'Approved') == "Approved" else 1)
        
    st.markdown("<br>", unsafe_allow_html=True)
    if st.button("💾 Save Changes", type="primary", use_container_width=True):
        supabase.table("claims").update({
            "claim_text": updated_text, "tier": new_tier.split()[0], "status": new_status, "evidence_id": evidence_dict[new_ev_title]
        }).eq("id", claim_data['id']).execute()
        st.rerun()

# ==============================================================================
# MARKETING VIEW
# ==============================================================================
if st.session_state.user_role == "Marketing Team":
    st.markdown("""<div class="header-container"><div class="header-title">🚀 Marketing Submissions</div><div class="header-subtitle">Submit proposed campaign copy for compliance verification.</div></div>""", unsafe_allow_html=True)
    
    ev_options = {"None": None}
    try:
        ev_data = supabase.table("evidence").select("id, title").eq("status", "Active").execute().data
        if ev_data: ev_options.update({e['title']: e['id'] for e in ev_data})
    except Exception: pass

    with st.container(border=True):
        st.subheader("📝 Draft Proposed Copy")
        with st.form("marketing_claim_form", clear_on_submit=True):
            proposed_claim = st.text_area("Proposed Claim Text", height=110)
            c1, c2 = st.columns(2)
            with c1: target_tier = st.selectbox("Target Claim Tier", ["T2 (Substantiated)", "T3 (Qualified)"])
            with c2: selected_study = st.selectbox("Link Supporting Study", list(ev_options.keys()))
            
            if st.form_submit_button("Submit for Legal Review", type="primary"):
                if not proposed_claim: st.warning("Enter proposed copy.")
                else:
                    supabase.table("claim_submissions").insert({
                        "proposed_claim": proposed_claim, "target_tier": target_tier.split()[0],
                        "submitted_by": st.session_state.user.email, "human_status": "Pending Review",
                        "evidence_id": ev_options.get(selected_study)
                    }).execute()
                    st.success("✅ Submitted to Legal Review Queue!")
                    st.rerun()

# ==============================================================================
# LEGAL & COMPLIANCE VIEW
# ==============================================================================
elif st.session_state.user_role == "Legal & Compliance":
    st.markdown("""<div class="header-container"><div class="header-title">🛡️ Compliance Command Center</div><div class="header-subtitle">Audit evidence, review submissions, and manage the master claim registry.</div></div>""", unsafe_allow_html=True)

    try:
        ev_count = len(supabase.table("evidence").select("id").eq("status", "Active").execute().data or [])
        pen_count = len(supabase.table("claim_submissions").select("id").eq("human_status", "Pending Review").execute().data or [])
        clm_count = len(supabase.table("claims").select("id").eq("status", "Approved").execute().data or [])
        out_count = len(supabase.table("evidence").select("id").eq("status", "Outdated").execute().data or [])
        
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Active Evidence", ev_count)
        m2.metric("Pending Review Queue", pen_count, delta="Action Needed" if pen_count > 0 else "Clear", delta_color="inverse")
        m3.metric("Approved Master Claims", clm_count)
        m4.metric("Outdated Studies", out_count)
    except Exception: pass

    st.markdown("<br>", unsafe_allow_html=True)
    tab_evidence, tab_pipeline, tab_claims = st.tabs(["🔬 Evidence Catalog", "⚖️ Review Queue", "📋 Master Claims Registry"])

    # --------------------------------------------------------------------------
    # TAB 1: EVIDENCE CATALOG (Now with Grid View!)
    # --------------------------------------------------------------------------
    with tab_evidence:
        ev_main, ev_side = st.columns([7, 3], gap="large")
        with ev_side:
            st.markdown("### 🎛️ Controls")
            if st.button("➕ Upload New Evidence", type="primary", use_container_width=True):
                upload_evidence_modal()
            st.divider()
            
            # FEATURE: Grid vs Card toggle for Evidence
            ev_view_mode = st.radio("Display Layout", ["Card View (Detail)", "Grid View (Analytics)"], horizontal=True, key="ev_view_toggle")
            st.divider()
            
            s_query = st.text_input("🔍 Search Studies")
            stat_filter = st.radio("Status", ["All", "Active Only", "Outdated Only"], horizontal=True)
            
        with ev_main:
            st.markdown("### 📚 Scientific Library")
            try:
                ev_data = supabase.table("evidence").select("*").order("created_at", desc=True).execute().data or []
                if stat_filter == "Active Only": ev_data = [e for e in ev_data if e.get('status') == 'Active']
                elif stat_filter == "Outdated Only": ev_data = [e for e in ev_data if e.get('status') == 'Outdated']
                if s_query: ev_data = [e for e in ev_data if s_query.lower() in str(e).lower()]
                
                if not ev_data:
                    st.info("No studies match your current filters.")
                else:
                    if ev_view_mode == "Grid View (Analytics)":
                        # Display as Pandas DataFrame
                        df_ev = pd.DataFrame(ev_data)
                        df_ev = df_ev.rename(columns={
                            'title': 'Study Title', 
                            'evidence_type': 'Type', 
                            'status': 'Status', 
                            'added_by': 'Uploader', 
                            'description': 'Summary'
                        })
                        display_cols = ['Study Title', 'Type', 'Status', 'Uploader', 'Summary']
                        st.dataframe(df_ev[[c for c in display_cols if c in df_ev.columns]], use_container_width=True, hide_index=True)
                    else:
                        # Display as Cards
                        for study in ev_data:
                            is_act = study.get('status') == 'Active'
                            with st.expander(f"{'🟢' if is_act else '⚪'} {study.get('title', 'Untitled')}"):
                                st.markdown(f"{render_badge(study.get('status', 'Active'), 'active' if is_act else 'outdated')} {render_badge(study.get('evidence_type', 'N/A'), 'outdated')}", unsafe_allow_html=True)
                                st.write(f"**Findings:** {study.get('description', 'N/A')}")
                                
                                a1, a2, _ = st.columns([2, 2, 6])
                                with a1:
                                    if st.button("📄 View Document", key=f"rd_{study['id']}", use_container_width=True):
                                        view_study_modal(study.get('title'), study.get('study_content'), study.get('primary_document_base64'))
                                with a2:
                                    if is_act and st.button("🗄️ Mark Outdated", key=f"out_{study['id']}", type="secondary", use_container_width=True):
                                        supabase.table("evidence").update({"status": "Outdated"}).eq("id", study['id']).execute()
                                        st.rerun()
            except Exception as e: st.error(f"Error: {e}")

    # --------------------------------------------------------------------------
    # TAB 2: REVIEW QUEUE
    # --------------------------------------------------------------------------
    with tab_pipeline:
        st.markdown("### ⚖️ Pending Legal Review")
        try:
            p_data = supabase.table("claim_submissions").select("*").eq("human_status", "Pending Review").execute().data or []
            if not p_data:
                st.success("🎉 Inbox Zero! All claim submissions have been reviewed.")
            else:
                st.caption("Check the box next to claims to approve or reject them in bulk.")
                df_queue = pd.DataFrame(p_data)
                df_queue.insert(0, "Select", False)
                ev_lookup = {e['id']: e['title'] for e in supabase.table("evidence").select("id, title").execute().data or []}
                df_queue['Linked Study'] = df_queue['evidence_id'].map(ev_lookup).fillna("None")
                
                edited_queue = st.data_editor(
                    df_queue[['Select', 'proposed_claim', 'target_tier', 'submitted_by', 'Linked Study']],
                    column_config={"Select": st.column_config.CheckboxColumn("Select", default=False)},
                    disabled=["proposed_claim", "target_tier", "submitted_by", "Linked Study"],
                    use_container_width=True, hide_index=True
                )
                
                selected_indices = edited_queue[edited_queue['Select']].index
                
                c_app, c_rej, _ = st.columns([2, 2, 6])
                with c_app:
                    if st.button("✅ Approve Selected", type="primary", use_container_width=True, disabled=len(selected_indices)==0):
                        with st.spinner("Processing approvals..."):
                            for idx in selected_indices:
                                claim = p_data[idx]
                                supabase.table("claim_submissions").update({"human_status": "Approved"}).eq("id", claim['id']).execute()
                                supabase.table("claims").insert({"claim_text": claim['proposed_claim'], "tier": claim['target_tier'], "evidence_id": claim.get('evidence_id'), "status": "Approved"}).execute()
                        st.success(f"{len(selected_indices)} claims approved!")
                        st.rerun()
                with c_rej:
                    if st.button("❌ Reject Selected", type="secondary", use_container_width=True, disabled=len(selected_indices)==0):
                        with st.spinner("Processing rejections..."):
                            for idx in selected_indices:
                                supabase.table("claim_submissions").update({"human_status": "Rejected"}).eq("id", p_data[idx]['id']).execute()
                        st.success(f"{len(selected_indices)} claims rejected!")
                        st.rerun()
        except Exception as e: st.error(f"Error fetching queue: {e}")

    # --------------------------------------------------------------------------
    # TAB 3: MASTER CLAIMS REGISTRY
    # --------------------------------------------------------------------------
    with tab_claims:
        mc_main, mc_side = st.columns([7, 3], gap="large")
        
        with mc_side:
            st.markdown("### 🎛️ Filters & Views")
            view_mode = st.radio("Display Layout", ["Card View (Editable)", "Grid View (Analytics)"], horizontal=True)
            st.divider()
            c_search = st.text_input("🔍 Search copy...")
            t_filter = st.radio("Tier", ["All", "T1", "T2", "T3"], horizontal=True)
            
        with mc_main:
            st.markdown("### 📋 Active Master Registry")
            try:
                ev_raw = supabase.table("evidence").select("id, title, status").execute().data or []
                ev_dict = {"None": None}
                ev_status_dict = {}
                for e in ev_raw:
                    ev_dict[e['title']] = e['id']
                    ev_status_dict[e['id']] = e['status']
                    
                claims_data = supabase.table("claims").select("*").order("created_at", desc=True).execute().data or []
                
                if t_filter != "All": claims_data = [c for c in claims_data if c.get('tier') == t_filter]
                if c_search: claims_data = [c for c in claims_data if c_search.lower() in str(c.get('claim_text', '')).lower()]

                if not claims_data:
                    st.info("No claims match filters.")
                else:
                    def get_gap_flag(ev_id):
                        if not ev_id: return "⚠️ Orphaned (No Study)"
                        if ev_status_dict.get(ev_id) == "Outdated": return "🚨 Outdated Evidence"
                        return "✅ Verified"

                    if view_mode == "Grid View (Analytics)":
                        df_claims = pd.DataFrame(claims_data)
                        df_claims['Study Link'] = df_claims['evidence_id'].map({v: k for k, v in ev_dict.items()}).fillna("None")
                        df_claims['Verification Status'] = df_claims['evidence_id'].apply(get_gap_flag)
                        st.dataframe(df_claims[['claim_text', 'tier', 'status', 'Study Link', 'Verification Status']], use_container_width=True, hide_index=True)
                    else:
                        for c in claims_data:
                            stat, tier, ev_id = c.get('status', 'Approved'), c.get('tier', 'T3'), c.get('evidence_id')
                            gap_flag = get_gap_flag(ev_id)
                            flag_html = render_badge(gap_flag, 'risk' if '⚠️' in gap_flag or '🚨' in gap_flag else 'active')
                            
                            with st.expander(f"[{tier}] {c.get('claim_text', '')[:60]}..."):
                                c1, c2 = st.columns([5, 1])
                                with c1:
                                    st.markdown(f"{render_badge(tier, tier.lower() if tier.lower() in ['t1','t2','t3'] else 'active')} {render_badge(stat, 'active' if stat=='Approved' else 'revoked')} {flag_html}", unsafe_allow_html=True)
                                    st.markdown(f"**Copy:** {c.get('claim_text')}")
                                    st.caption(f"📄 Supporting Study: {next((t for t, eid in ev_dict.items() if eid == ev_id), 'None')}")
                                with c2:
                                    if st.button("✏️ Edit", key=f"edit_{c['id']}", use_container_width=True):
                                        edit_claim_modal(c, ev_dict)
            except Exception as e: st.error(f"Error fetching registry: {e}")
