import asyncio
import time

import streamlit as st
import inngest
from dotenv import load_dotenv
import os
import requests
from data_loader import authenticate_dozuki
from vector_db import QdrantStorage

load_dotenv()


def run_async(coro):
    """Helper to run async functions in Streamlit."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


st.set_page_config(page_title="RAG Dozuki Guide Manager",
                   page_icon="📖", layout="wide")


@st.cache_resource
def get_inngest_client() -> inngest.Inngest:
    return inngest.Inngest(app_id="rag_app", is_production=False)


def _inngest_api_base() -> str:
    return os.getenv("INNGEST_API_BASE", "http://127.0.0.1:8288/v1")


def get_document_count() -> int:
    try:
        with QdrantStorage() as storage:
            return storage.count()
    except Exception:
        return 0


def fetch_runs(event_id: str) -> list[dict]:
    url = f"{_inngest_api_base()}/events/{event_id}/runs"
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()
    return data.get("data", [])


def fetch_run_details(run_id: str) -> dict:
    """Fetch detailed information about a specific run."""
    url = f"{_inngest_api_base()}/runs/{run_id}"
    try:
        resp = requests.get(url)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return {}


def get_run_error_details(run: dict) -> str:
    """Extract detailed error message from a failed run."""
    error_parts = []

    if run.get("error"):
        error_parts.append(str(run.get("error")))

    if run.get("output"):
        output = run.get("output")
        if isinstance(output, dict) and output.get("error"):
            error_parts.append(str(output.get("error")))
        elif isinstance(output, str):
            error_parts.append(output)

    event_data = run.get("event", {})
    if event_data.get("error"):
        error_parts.append(str(event_data.get("error")))

    if run.get("ended_at") and not error_parts:
        if run.get("name"):
            error_parts.append(
                f"Function '{run.get('name')}' failed without detailed error message")
        else:
            error_parts.append(
                "Function failed without detailed error message")

    if not error_parts:
        return f"Unknown error occurred. Run status: {run.get('status')}"

    return " | ".join(error_parts)


def wait_for_run_output(event_id: str, timeout_s: float = 120.0, poll_interval_s: float = 0.5) -> dict:
    start = time.time()
    last_status = None
    run_id = None
    while True:
        runs = fetch_runs(event_id)
        if runs:
            run = runs[0]
            run_id = run.get("id")
            status = run.get("status")
            last_status = status or last_status
            if status in ("Completed", "Succeeded", "Success", "Finished"):
                return run.get("output") or {}
            if status in ("Failed", "Cancelled"):
                if run_id:
                    detailed_run = fetch_run_details(run_id)
                    if detailed_run:
                        run = detailed_run

                error_message = get_run_error_details(run)
                raise RuntimeError(error_message)
        if time.time() - start > timeout_s:
            raise TimeoutError(
                f"Timed out waiting for run output (last status: {last_status})")
        time.sleep(poll_interval_s)


async def send_rag_ingest_event(guide_id: int, token: str) -> str:
    client = get_inngest_client()
    result = await client.send(
        inngest.Event(
            name="rag/ingest_guide",
            data={
                "guide_id": guide_id,
                "token": token,
                "source_id": f"guide_{guide_id}",
            },
        )
    )
    return result[0]


async def send_site_ingest_event(token: str, site_id: str = "hansaw", batch_size: int = 10, resume_offset: int = 0) -> str:
    client = get_inngest_client()
    result = await client.send(
        inngest.Event(
            name="rag/ingest_site",
            data={
                "token": token,
                "site_id": site_id,
                "batch_size": batch_size,
                "resume_offset": resume_offset,
            },
        )
    )
    return result[0]


async def send_pause_event(site_id: str):
    client = get_inngest_client()
    await client.send(
        inngest.Event(
            name="rag/pause_site_ingestion",
            data={"site_id": site_id},
        )
    )


async def send_rag_query_event(question: str, top_k: int, token: str) -> str:
    client = get_inngest_client()
    result = await client.send(
        inngest.Event(
            name="rag/query_guide_ai",
            data={
                "question": question,
                "top_k": top_k,
                "token": token,
            },
        )
    )
    return result[0]


# Initialize session state
if "dozuki_token" not in st.session_state:
    st.session_state.dozuki_token = None

if "ingested_guides" not in st.session_state:
    st.session_state.ingested_guides = []

if "site_ingestion_active" not in st.session_state:
    st.session_state.site_ingestion_active = False

if "site_ingestion_event_id" not in st.session_state:
    st.session_state.site_ingestion_event_id = None

if "site_resume_offset" not in st.session_state:
    st.session_state.site_resume_offset = 0

st.title("📖 Dozuki Guide RAG Manager")

# Login Section
with st.sidebar:
    st.header("Authentication")

    if not st.session_state.dozuki_token:
        with st.form("dozuki_login"):
            email = st.text_input("Email", type="default")
            password = st.text_input("Password", type="password")
            login_submitted = st.form_submit_button(
                "Login to hansaw.dozuki.com")

            if login_submitted and email and password:
                with st.spinner("Authenticating..."):
                    try:
                        token = authenticate_dozuki(email, password)
                        st.session_state.dozuki_token = token
                        st.success("Successfully authenticated!")
                        time.sleep(0.5)
                        st.rerun()
                    except Exception as e:
                        st.error(f"Authentication failed: {str(e)}")
    else:
        st.success("✅ Logged in")
        if st.button("🚪 Logout"):
            st.session_state.dozuki_token = None
            st.session_state.ingested_guides = []
            st.session_state.site_ingestion_active = False
            st.session_state.site_ingestion_event_id = None
            st.rerun()

if not st.session_state.dozuki_token:
    st.info("👈 Please login via the sidebar to access guide ingestion")
    st.stop()

# Main content area with tabs
tab1, tab2, tab3 = st.tabs(
    ["📄 Single Guide", "🌐 Entire Site", "🔧 Development"])

# Single Guide Ingestion Tab
with tab1:
    st.header("Ingest Single Guide")

    if st.session_state.ingested_guides:
        st.info(
            f"✅ Ingested guides: {', '.join([f'Guide {gid}' for gid in st.session_state.ingested_guides])}")

    with st.form("guide_ingest"):
        guide_id = st.number_input(
            "Guide ID", min_value=1, step=1, format="%d")
        ingest_submitted = st.form_submit_button("Ingest Guide")

        if ingest_submitted and guide_id:
            with st.spinner(f"Ingesting guide {guide_id}..."):
                try:
                    event_id = run_async(send_rag_ingest_event(
                        int(guide_id), st.session_state.dozuki_token))

                    output = wait_for_run_output(event_id, timeout_s=180.0)
                    ingested_count = output.get("ingested", 0)

                    if guide_id not in st.session_state.ingested_guides:
                        st.session_state.ingested_guides.append(guide_id)

                    st.success(
                        f"✅ Successfully ingested guide {guide_id}! ({ingested_count} chunks processed)")
                    time.sleep(1)
                    st.rerun()

                except Exception as e:
                    handle_ingestion_error(e)

# Site Ingestion Tab
with tab2:
    st.header("Ingest Entire Site")
    st.caption("Ingest all guides from the Dozuki site")

    col1, col2 = st.columns([3, 1])

    with col1:
        batch_size = st.slider("Batch Size", min_value=5, max_value=50, value=10,
                               help="Number of guides to process in each batch")

    with col2:
        if not st.session_state.site_ingestion_active:
            button_text = "🚀 Start Site Ingestion" if st.session_state.site_resume_offset == 0 else f"▶️ Resume from Guide {st.session_state.site_resume_offset}"
            if st.button(button_text, use_container_width=True):
                st.session_state.site_ingestion_active = True
                event_id = run_async(send_site_ingest_event(
                    st.session_state.dozuki_token,
                    site_id="hansaw",
                    batch_size=batch_size,
                    resume_offset=st.session_state.site_resume_offset
                ))
                st.session_state.site_ingestion_event_id = event_id
                st.rerun()
        else:
            if st.button("⏸️ Pause Ingestion", use_container_width=True):
                run_async(send_pause_event("hansaw"))
                st.session_state.site_ingestion_active = False
                st.warning(
                    "Pausing ingestion... The current guide will complete before stopping.")

    # Progress tracking
    if st.session_state.site_ingestion_active and st.session_state.site_ingestion_event_id:
        progress_container = st.container()

        with progress_container:
            # Create placeholders for dynamic updates
            status_placeholder = st.empty()
            progress_bar = st.progress(0)
            stats_cols = st.columns(4)
            current_guide_placeholder = st.empty()
            error_placeholder = st.empty()

            # Initialize progress state
            if "site_progress" not in st.session_state:
                st.session_state.site_progress = {
                    "total_guides": 0,
                    "processed_guides": 0,
                    "failed_guides": 0,
                    "total_chunks": 0,
                    "current_guide": "",
                    "errors": []
                }

            # Poll for run status and progress
            try:
                runs = fetch_runs(st.session_state.site_ingestion_event_id)
                if runs:
                    run = runs[0]
                    status = run.get("status", "Unknown")

                    # Check Inngest events for progress updates
                    events_url = f"{_inngest_api_base()}/events?name=rag/site_progress"
                    try:
                        resp = requests.get(events_url)
                        if resp.status_code == 200:
                            events = resp.json().get("data", [])
                            # Process recent progress events
                            for event in events[:10]:  # Check last 10 events
                                event_data = event.get("data", {})
                                if event_data.get("site_id") == "hansaw":
                                    # Update progress state
                                    if event_data.get("total_guides"):
                                        st.session_state.site_progress["total_guides"] = event_data["total_guides"]
                                    if event_data.get("processed_guides") is not None:
                                        st.session_state.site_progress["processed_guides"] = event_data["processed_guides"]
                                    if event_data.get("failed_guides") is not None:
                                        st.session_state.site_progress["failed_guides"] = event_data["failed_guides"]
                                    if event_data.get("total_chunks"):
                                        st.session_state.site_progress["total_chunks"] = event_data["total_chunks"]
                                    if event_data.get("current_guide"):
                                        st.session_state.site_progress["current_guide"] = event_data["current_guide"]
                                    if event_data.get("error"):
                                        st.session_state.site_progress["errors"].append(
                                            event_data["error"])
                    except:
                        pass  # Ignore event fetch errors

                    # Display current progress
                    progress = st.session_state.site_progress

                    if progress["total_guides"] > 0:
                        progress_pct = progress["processed_guides"] / \
                            progress["total_guides"]
                        progress_bar.progress(progress_pct)

                    with stats_cols[0]:
                        st.metric("Total Guides", progress["total_guides"])
                    with stats_cols[1]:
                        st.metric("Processed", progress["processed_guides"])
                    with stats_cols[2]:
                        st.metric("Failed", progress["failed_guides"])
                    with stats_cols[3]:
                        st.metric("Chunks", progress["total_chunks"])

                    if progress["current_guide"]:
                        current_guide_placeholder.info(
                            f"📖 Processing: {progress['current_guide']}")

                    # Check if completed
                    if status in ("Completed", "Succeeded", "Success", "Finished"):
                        output = run.get("output", {})
                        st.session_state.site_ingestion_active = False
                        st.session_state.site_resume_offset = 0  # Reset for next run

                        # Display final stats
                        status_placeholder.success(
                            "✅ Site ingestion completed!")
                        progress_bar.progress(1.0)

                        # Update final metrics
                        with stats_cols[0]:
                            st.metric("Total Guides", output.get(
                                "processed_guides", progress["processed_guides"]))
                        with stats_cols[1]:
                            st.metric("Processed", output.get(
                                "processed_guides", progress["processed_guides"]))
                        with stats_cols[2]:
                            st.metric("Failed", output.get(
                                "failed_guides", progress["failed_guides"]))
                        with stats_cols[3]:
                            st.metric("Chunks", output.get(
                                "total_chunks", progress["total_chunks"]))

                        if output.get("errors"):
                            with error_placeholder.expander(f"⚠️ {len(output['errors'])} guides failed"):
                                for err in output["errors"]:
                                    st.error(
                                        f"Guide {err['guide_id']} ({err['title']}): {err['error']}")

                        # Clear progress state
                        if "site_progress" in st.session_state:
                            del st.session_state.site_progress

                    elif status in ("Failed", "Cancelled"):
                        st.session_state.site_ingestion_active = False
                        status_placeholder.error("❌ Site ingestion failed!")
                        error_message = get_run_error_details(run)
                        error_placeholder.error(f"Error: {error_message}")

                        # Clear progress state
                        if "site_progress" in st.session_state:
                            del st.session_state.site_progress

                    elif output := run.get("output"):
                        # Check if paused
                        if output.get("status") == "paused":
                            st.session_state.site_ingestion_active = False
                            st.session_state.site_resume_offset = output.get(
                                "resume_offset", 0)
                            status_placeholder.warning(
                                "⏸️ Site ingestion paused")
                            st.info(
                                f"Processed {output.get('processed_guides', 0)} guides. You can resume from guide {st.session_state.site_resume_offset}.")

                            # Clear progress state
                            if "site_progress" in st.session_state:
                                del st.session_state.site_progress

                    else:
                        # Still running
                        status_placeholder.info(
                            "⏳ Site ingestion in progress...")

                        # Auto-refresh every 2 seconds
                        time.sleep(2)
                        st.rerun()

            except Exception as e:
                st.session_state.site_ingestion_active = False
                error_placeholder.error(f"Error tracking progress: {str(e)}")

                # Clear progress state
                if "site_progress" in st.session_state:
                    del st.session_state.site_progress

# Development Tab
with tab3:
    st.header("🔧 Development Info")
    st.caption("Useful information for debugging and development")

    dev_tab1, dev_tab2, dev_tab3, dev_tab4 = st.tabs(
        ["🔑 Authentication", "⚙️ Configuration", "💾 Session State", "📊 System Info"])

    with dev_tab1:
        st.subheader("Authentication Details")

        if st.session_state.dozuki_token:
            st.success("✅ Authenticated")

            with st.expander("🔑 Current Token", expanded=False):
                st.code(st.session_state.dozuki_token, language="text")
                if st.button("📋 Copy Token to Clipboard"):
                    st.toast("Token copied!", icon="✅")

            token_length = len(st.session_state.dozuki_token)
            st.metric("Token Length", token_length)

            if st.button("🔄 Refresh Token Display"):
                st.rerun()
        else:
            st.warning("⚠️ Not authenticated")

    with dev_tab2:
        st.subheader("Configuration & Environment")

        config_data = {
            "Inngest API Base": _inngest_api_base(),
            "Inngest App ID": "rag_app",
            "Inngest Production Mode": "False",
        }

        for key, value in config_data.items():
            st.text(f"{key}: {value}")

        st.divider()

        st.subheader("Environment Variables")
        env_vars = {
            "INNGEST_API_BASE": os.getenv("INNGEST_API_BASE", "Not set (using default)"),
            "AWS_REGION": os.getenv("AWS_REGION", "Not set"),
            "AWS_ACCESS_KEY_ID": "***" if os.getenv("AWS_ACCESS_KEY_ID") else "Not set",
            "AWS_SECRET_ACCESS_KEY": "***" if os.getenv("AWS_SECRET_ACCESS_KEY") else "Not set",
        }

        for key, value in env_vars.items():
            st.text(f"{key}: {value}")

    with dev_tab3:
        st.subheader("Session State")

        st.caption("Current session state variables:")

        session_vars = {
            "dozuki_token": "***" if st.session_state.dozuki_token else None,
            "ingested_guides": st.session_state.get("ingested_guides", []),
            "site_ingestion_active": st.session_state.get("site_ingestion_active", False),
            "site_ingestion_event_id": st.session_state.get("site_ingestion_event_id"),
            "site_resume_offset": st.session_state.get("site_resume_offset", 0),
        }

        if "site_progress" in st.session_state:
            session_vars["site_progress"] = st.session_state.site_progress

        st.json(session_vars)

        st.divider()

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 Refresh Session State"):
                st.rerun()
        with col2:
            with st.expander("⚠️ Clear Session State"):
                st.warning(
                    "This will clear all session state except authentication")
                if st.button("Clear Non-Auth State", type="primary"):
                    st.session_state.ingested_guides = []
                    st.session_state.site_ingestion_active = False
                    st.session_state.site_ingestion_event_id = None
                    st.session_state.site_resume_offset = 0
                    if "site_progress" in st.session_state:
                        del st.session_state.site_progress
                    st.success("Session state cleared!")
                    time.sleep(0.5)
                    st.rerun()

    with dev_tab4:
        st.subheader("System Information")

        doc_count = get_document_count()
        st.metric("Total Documents in Vector DB", doc_count)

        st.divider()

        st.subheader("API Endpoints")
        api_endpoints = {
            "Inngest Events": f"{_inngest_api_base()}/events",
            "Inngest Runs": f"{_inngest_api_base()}/runs",
            "Inngest Events (specific)": f"{_inngest_api_base()}/events/{{event_id}}",
            "Inngest Runs (specific)": f"{_inngest_api_base()}/runs/{{run_id}}",
        }

        for endpoint_name, endpoint_url in api_endpoints.items():
            st.code(f"{endpoint_name}: {endpoint_url}", language="text")

        st.divider()

        st.subheader("Quick Actions")
        col1, col2 = st.columns(2)

        with col1:
            if st.button("🧪 Test Inngest Connection"):
                try:
                    url = f"{_inngest_api_base()}/events"
                    resp = requests.get(url)
                    if resp.status_code == 200:
                        st.success(
                            f"✅ Connection successful! (Status: {resp.status_code})")
                    else:
                        st.warning(
                            f"⚠️ Connection returned status: {resp.status_code}")
                except Exception as e:
                    st.error(f"❌ Connection failed: {str(e)}")

        with col2:
            if st.button("📊 Check Vector DB Status"):
                try:
                    with QdrantStorage() as storage:
                        count = storage.count()
                        st.success(
                            f"✅ Vector DB is accessible with {count} documents")
                except Exception as e:
                    st.error(f"❌ Vector DB error: {str(e)}")


def handle_ingestion_error(e: Exception):
    """Handle errors during ingestion with appropriate messages."""
    error_msg = str(e)
    st.error(f"❌ Ingestion failed: {error_msg}")

    if "ThrottlingException" in error_msg or "429" in error_msg or "quota" in error_msg.lower():
        st.warning(
            "💡 **AWS Bedrock rate limit exceeded.** Please check your AWS account quotas.")
    elif "AccessDeniedException" in error_msg or "401" in error_msg:
        st.warning(
            "💡 **Authentication error.** Please verify your AWS credentials.")

    with st.expander("View full error details"):
        st.code(error_msg, language="text")


def handle_query_error(e: Exception):
    """Handle errors during query with appropriate messages."""
    error_msg = str(e)
    st.error(f"❌ Query failed: {error_msg}")

    if "ThrottlingException" in error_msg or "429" in error_msg:
        st.warning(
            "💡 **AWS Bedrock rate limit exceeded.** Try again in a few moments.")
    elif "AccessDeniedException" in error_msg or "401" in error_msg:
        st.warning(
            "💡 **Authentication error.** Please verify your AWS credentials.")

    with st.expander("View full error details"):
        st.code(error_msg, language="text")


# Footer
st.divider()
with st.container():
    col1, col2 = st.columns([3, 1])
    with col1:
        st.caption("RAG Dozuki Guide Manager - Powered by AWS Bedrock & Inngest")
    with col2:
        if st.button("🗑️ Clear All Data"):
            with st.spinner("Clearing database..."):
                try:
                    with QdrantStorage() as storage:
                        storage.clear_all()
                    st.session_state.ingested_guides = []
                    st.session_state.site_resume_offset = 0
                    st.success("✅ Database cleared and reset successfully!")
                except Exception as e:
                    st.error(f"Failed to clear database: {str(e)}")
            time.sleep(0.5)
            st.rerun()
