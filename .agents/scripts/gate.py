#!/usr/bin/env python3
import sys
import json
import os

PROJECT_DIR = os.path.abspath(os.getcwd())

def is_inside_project(target_path):
    if not target_path:
        return True
    abs_path = os.path.abspath(os.path.expanduser(target_path))
    # Returns True if the target path starts with the project directory
    return os.path.commonpath([abs_path, PROJECT_DIR]) == PROJECT_DIR

def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            print(json.dumps({"decision": "allow"}))
            return
        payload = json.loads(raw_input)
    except Exception:
        print(json.dumps({"decision": "ask"}))
        return

    tool_name = payload.get("tool_name", "")
    tool_args = payload.get("tool_args", {})

    # Check file modifications or reads
    file_path = tool_args.get("file_path") or tool_args.get("path")
    if file_path and not is_inside_project(file_path):
        print(json.dumps({
            "decision": "ask",
            "reason": f"Path is outside the project directory: {file_path}"
        }))
        return

    # Check terminal/shell commands targeting parent or absolute external directories
    if tool_name == "run_command":
        cmd = tool_args.get("command", "")
        # Detect common directory escapes
        if ".." in cmd or cmd.startswith("/") or "~" in cmd:
            print(json.dumps({
                "decision": "ask",
                "reason": "Command may access paths outside the project workspace."
            }))
            return

    # Everything inside the project runs free
    print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
