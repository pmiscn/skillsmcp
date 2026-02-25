#!/usr/bin/env python3
import json
import os
import sqlite3
import requests
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Constants
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH = PROJECT_ROOT / "api" / "prisma" / "dev.db"
DB_LOCK = threading.Lock()

def get_db_connection():
    # Use timeout to handle "database is locked" errors common in SQLite
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    try:
        # Enable WAL mode to improve concurrent read/write behavior
        conn.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        # If setting WAL fails, continue with the default mode
        pass
    return conn

def get_llm_config() -> Optional[Dict]:
    """Fetch LLM configuration from the database."""
    try:
        with DB_LOCK:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM SystemConfig WHERE key = 'security_llm_config'")
            row = cursor.fetchone()
            conn.close()
        if row:
            return json.loads(row[0])
    except Exception as e:
        print(f"Error fetching LLM config: {e}", flush=True)
    return None

def save_audit_report(skill_id: str, provider: str, model: str, score: int, report: str, status: str = "completed"):
    import uuid
    report_id = f"audit_{skill_id}_{uuid.uuid4().hex[:8]}"
    attempts = 3
    backoff = 1
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            with DB_LOCK:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO AuditReport (id, skill_id, provider, model, score, report, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (report_id, skill_id, provider, model, score, report, status, datetime.utcnow().isoformat() + "Z")
                )

                if status == "completed":
                    cursor.execute("SELECT security_data FROM Skill WHERE id = ?", (skill_id,))
                    row = cursor.fetchone()
                    sec_data = json.loads(row[0]) if row and row[0] else {}
                    sec_data["llm_audit_score"] = score
                    sec_data["last_audit_id"] = report_id

                    cursor.execute(
                        "UPDATE Skill SET security_score = ?, security_data = ?, updatedAt = ? WHERE id = ?",
                        (score, json.dumps(sec_data), datetime.utcnow().isoformat() + "Z", skill_id)
                    )

                conn.commit()
                conn.close()
            print(f"Audit report saved for skill: {skill_id} with status: {status}", flush=True)
            return
        except Exception as e:
            last_exc = e
            # write error to a log file for later inspection
            try:
                log_dir = SCRIPT_DIR.parent / 'logs'
                log_dir.mkdir(parents=True, exist_ok=True)
                err_log = log_dir / 'security_auditor_errors.log'
                with open(err_log, 'a', encoding='utf-8') as fh:
                    fh.write(f"{datetime.utcnow().isoformat()}Z - Error saving audit report for {skill_id} (attempt {attempt}): {repr(e)}\n")
            except Exception:
                pass
            print(f"Error saving audit report for {skill_id} (attempt {attempt}): {e}", flush=True)
            if attempt < attempts:
                time.sleep(backoff)
                backoff *= 2
    # after attempts
    print(f"Failed to save audit report for {skill_id} after {attempts} attempts: {last_exc}", flush=True)

def resolve_api_key(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if value in os.environ:
        return os.environ[value]
    return value

def call_llm(config: Dict, prompt: str) -> Optional[str]:
    provider = config.get("provider")
    model = config.get("model")
    api_key = resolve_api_key(config.get("api_key"))
    base_url = config.get("base_url")
    proxy = config.get("proxy")
    # If no proxy is specified in config, explicitly set proxies to None-values 
    # to prevent requests from falling back to system environment variables (like HTTP_PROXY).
    if proxy and proxy.strip():
        proxies = {"http": proxy, "https": proxy}
    else:
        # Explicitly disable proxy to avoid using system-wide proxy settings
        proxies = {"http": None, "https": None}
    
    timeout = 120
    max_retries = 5

    for attempt in range(max_retries):
        try:
            print(f"DEBUG: Calling LLM {provider} with timeout {timeout}, attempt {attempt + 1}", flush=True)
            openai_compatible = ["openai", "qwen", "deepseek", "siliconflow", "groq", "openrouter", "mistral", "xai", "custom"]
            
            if provider in openai_compatible or provider == "azure":
                url = f"{base_url}/chat/completions" if base_url and provider != "azure" else base_url
                if not url and provider == "openai":
                    url = "https://api.openai.com/v1/chat/completions"
                    
                if not url:
                    print(f"DEBUG: URL is missing for provider {provider}", flush=True)
                    return None
                    
                headers = {
                    "Content-Type": "application/json"
                }
                
                if provider == "azure":
                    if api_key:
                        headers["api-key"] = api_key
                else:
                    if api_key:
                        headers["Authorization"] = f"Bearer {api_key}"
                    
                payload = {
                    "model": model if model else "default",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 4096
                }
                
                # Debug logging for the request
                masked_headers = headers.copy()
                if "Authorization" in masked_headers:
                    auth_val = masked_headers["Authorization"]
                    if len(auth_val) > 20:
                        masked_headers["Authorization"] = auth_val[:15] + "..." + auth_val[-5:]
                    else:
                        masked_headers["Authorization"] = "Bearer " + "*" * 10
                if "api-key" in masked_headers:
                    key_val = masked_headers["api-key"]
                    if len(key_val) > 10:
                        masked_headers["api-key"] = key_val[:4] + "..." + key_val[-4:]
                    else:
                        masked_headers["api-key"] = "*" * 10
                
                print(f"DEBUG: [LLM Request] Provider: {provider}, Model: {model}", flush=True)
                print(f"DEBUG: [LLM Request] URL: {url}", flush=True)
                print(f"DEBUG: [LLM Request] Headers: {json.dumps(masked_headers)}", flush=True)
                
                # Printing only first 500 chars of prompt to avoid log bloat
                debug_payload = payload.copy()
                debug_payload["messages"] = [{"role": "user", "content": prompt[:500] + "..." if len(prompt) > 500 else prompt}]
                print(f"DEBUG: [LLM Request] Payload (truncated): {json.dumps(debug_payload, ensure_ascii=False)}", flush=True)

                try:
                    response = requests.post(url, headers=headers, json=payload, timeout=timeout, proxies=proxies)
                    
                    if response.status_code != 200:
                        print(f"DEBUG: [LLM Response Error] Status: {response.status_code}", flush=True)
                        print(f"DEBUG: [LLM Response Error] Body: {response.text}", flush=True)
                    
                    if response.status_code == 429:
                        wait_time = (attempt + 1) * 20
                        print(f"DEBUG: Rate limited (429). Retrying in {wait_time}s...", flush=True)
                        time.sleep(wait_time)
                        continue
                    
                    response.raise_for_status()
                    result = response.json()["choices"][0]["message"]["content"]
                    print(f"DEBUG: [LLM Response Success] {provider} returned {len(result)} chars", flush=True)
                    return result
                except requests.exceptions.RequestException as re:
                    print(f"DEBUG: [LLM Request Exception] {provider}: {re}", flush=True)
                    raise re
                
            elif provider == "ollama":
                url = f"{base_url}/api/generate" if base_url else "http://localhost:11434/api/generate"
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "stream": False
                }
                print(f"DEBUG: Request URL: {url}", flush=True)
                print(f"DEBUG: Request Payload: {json.dumps(payload, ensure_ascii=False)}", flush=True)
                response = requests.post(url, json=payload, timeout=timeout if timeout > 120 else 120, proxies=proxies)
                response.raise_for_status()
                return response.json()["response"]
                
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}]
                }
                print(f"DEBUG: Request URL: {url.split('?')[0]}?key=***", flush=True)
                response = requests.post(url, json=payload, timeout=timeout, proxies=proxies)
                response.raise_for_status()
                return response.json()["candidates"][0]["content"]["parts"][0]["text"]
                
            elif provider == "anthropic":
                url = base_url if base_url else "https://api.anthropic.com/v1/messages"
                headers = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": prompt}]
                }
                print(f"DEBUG: Request URL: {url}", flush=True)
                response = requests.post(url, headers=headers, json=payload, timeout=timeout, proxies=proxies)
                response.raise_for_status()
                return response.json()["content"][0]["text"]
                
        except Exception as e:
            if attempt < max_retries:
                wait_time = (attempt + 1) * 5
                print(f"DEBUG: Error calling LLM ({provider}): {e}. Retrying in {wait_time}s...", flush=True)
                time.sleep(wait_time)
            else:
                print(f"DEBUG: Error calling LLM ({provider}) for text output after {max_retries} attempts: {e}", flush=True)
    return None

def audit_skill(skill_id: str, config: Optional[Dict] = None):
    if not config:
        config = get_llm_config()
    if not config:
        print("LLM config not found. Please configure it in the settings.", flush=True)
        return

    try:
        with DB_LOCK:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT name, description, skill_path FROM Skill WHERE id = ?", (skill_id,))
            row = cursor.fetchone()
            conn.close()
    except Exception as e:
        print(f"Error fetching skill info for {skill_id}: {e}", flush=True)
        return

    if not row:
        print(f"Skill not found: {skill_id}", flush=True)
        return

    name, description, skill_path = row
    
    full_path = PROJECT_ROOT / skill_path
    if not full_path.exists():
        full_path = PROJECT_ROOT / "api" / skill_path
        if not full_path.exists():
            print(f"Skill path not found: {skill_path}", flush=True)
            save_audit_report(skill_id, "system", "path_resolver", 0, f"Skill path not found: {skill_path}", "failed")
            return

    content = ""
    skill_dir = full_path.parent
    MAX_TOTAL_CONTENT = 15000
    for file in skill_dir.glob("**/*"):
        if len(content) >= MAX_TOTAL_CONTENT:
            break
        if file.suffix in [".py", ".js", ".ts", ".md"] and file.is_file():
            try:
                file_content = file.read_text(encoding="utf-8", errors="replace")[:1500]
                content += f"\n--- File: {file.relative_to(skill_dir)} ---\n"
                content += file_content
            except:
                pass
    
    if len(content) > MAX_TOTAL_CONTENT:
        content = content[:MAX_TOTAL_CONTENT] + "\n... [Content truncated due to size limits] ..."

    prompt = f"""
You are a senior security architect and auditor performing a formal security review of a "Skill" in a local Model Context Protocol (MCP) registry.
A Skill is an autonomous software module (usually Python, JavaScript/TypeScript, or Shell) that operates within a controlled environment.

Skill Identity:
- Name: {name}
- ID: {skill_id}
- Description: {description}

Audit Scope (the following code includes multiple source files):
{content}

SECURITY AUDIT PROTOCOL:
Analyze the code for the following high-priority risk categories:

1. **Intent vs. Action**: Actions outside stated purpose?
2. **System Access**: Identify file system modifications, env variable reads, and subprocesses.
3. **Network Behavior**: Identify external calls or data exfiltration.
4. **Data Privacy**: Secure user data handling?
5. **Code Integrity**: Obfuscation or remote code loading?

AUDIT REPORTING REQUIREMENTS:
Provide a security score (0-100) and a Markdown report.
Score Guidelines:
- 90-100: Safe.
- 70-89: Caution.
- 40-69: Warning.
- 0-39: Critical risk.

Your report should be clear but CONCISE (keep it under 3000 characters).

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:
SCORE: <int>
REPORT:
<markdown_report>
"""

    print(f"Auditing skill: {name} ({skill_id}) using {config['provider']}...", flush=True)
    
    config_copy = config.copy()
    config_copy["json_mode_off"] = True
    
    result_text = call_llm(config_copy, prompt)
    
    if result_text:
        score = 0
        report = ""
        try:
            import re
            # Much more flexible regex to catch "Security Score: 85", "Final Score: 85", "SCORE: 85", etc.
            score_matches = list(re.finditer(r"(?i)SCORE[^0-9\n]*(\d+)", result_text))
            if score_matches:
                # Take the last mentioned score which is usually the "Final Score"
                score = int(score_matches[-1].group(1))
            
            # Look for REPORT: or a major markdown header starting the report sections
            report_matches = list(re.finditer(r"(?i)(?:^|[\r\n])[\s\-\*#]*(?:REPORT|ANALYSIS)[#\s\*:]*\s*[\*#\s]*(.*)", result_text, re.DOTALL))
            if report_matches:
                report = report_matches[-1].group(1).strip()
            
            if score > 0 and report:
                save_audit_report(skill_id, config["provider"], config["model"], score, report, "completed")
                return
            else:
                print(f"DEBUG: Failed to parse result_text for {skill_id}. Score: {score}, Report Length: {len(report)}. Result text: {result_text}", flush=True)
                save_audit_report(skill_id, config["provider"], config["model"], 0, f"Failed to parse LLM result. Raw: {result_text[:500]}...", "failed")
        except Exception as e:
            print(f"Error parsing audit result for {skill_id}: {e}", flush=True)
            save_audit_report(skill_id, config["provider"], config["model"], 0, f"Error parsing result: {str(e)}", "failed")
    else:
        # Save a failed audit report if LLM call itself failed (e.g. content safety filter)
        save_audit_report(skill_id, config["provider"], config["model"], 0, "LLM failed to return a result (possibly due to content safety filters or network errors).", "failed")

    print(f"Failed to get a valid audit result for {skill_id}", flush=True)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Skill Security Auditor")
    parser.add_argument("--skill_id", help="ID of the skill to audit")
    parser.add_argument("--all", action="store_true", help="Audit all skills")
    parser.add_argument("--concurrency", type=int, default=3, help="Number of concurrent audits")
    args = parser.parse_args()

    if args.skill_id:
        audit_skill(args.skill_id)
    elif args.all:
        lock_file = SCRIPT_DIR / "auditor.lock"
        if lock_file.exists():
            try:
                pid = int(lock_file.read_text())
                os.kill(pid, 0)
                print(f"Auditor is already running (PID: {pid}). Exiting.", flush=True)
                exit(0)
            except (ProcessLookupError, ValueError):
                pass
        
        lock_file.write_text(str(os.getpid()))
        
        try:
            print("Security Auditor started in daemon mode.", flush=True)
            while True:
                config = get_llm_config()
                if not config:
                    print("LLM config not found. Retrying in 60s...", flush=True)
                    time.sleep(60)
                    continue

                with DB_LOCK:
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    # Process in smaller batches to avoid loading thousands of IDs into memory
                    # and sending them to executor all at once.
                    cursor.execute("SELECT id FROM Skill WHERE id NOT IN (SELECT skill_id FROM AuditReport) LIMIT 100")
                    skill_ids = [row[0] for row in cursor.fetchall()]
                    conn.close()
                
                if skill_ids:
                    print(f"Found {len(skill_ids)} new skills to audit. Concurrency: {args.concurrency}", flush=True)
                    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
                        for sid in skill_ids:
                            executor.submit(audit_skill, sid, config)
                
                time.sleep(60)
        finally:
            if lock_file.exists():
                lock_file.unlink()
    else:
        parser.print_help()
